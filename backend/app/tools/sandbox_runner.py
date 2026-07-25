"""Subprocess entrypoint for the Python sandbox tool.

Reads a JSON payload {"code": str, "dataframes": dict[str, list[dict]]} on
stdin, executes `code` in a restricted namespace, and writes a JSON result
{"stdout": str, "result": Any, "artifacts": list[dict], "error": str | None}
to stdout. Runs as its own process (see tools/python_sandbox.py) so an
LLM-generated script can't touch the parent process's memory or the
outside filesystem/network.
"""

import ast
import base64
import io
import json
import resource
import sys

ALLOWED_TOP_LEVEL_MODULES = {
    "pandas",
    "numpy",
    "math",
    "json",
    "statistics",
    "itertools",
    "collections",
    "datetime",
    "matplotlib",
    "matplotlib.pyplot",
    "plotly",
    "plotly.graph_objects",
    "plotly.express",
}

SAFE_BUILTIN_NAMES = [
    "abs", "all", "any", "bool", "dict", "enumerate", "filter", "float",
    "int", "isinstance", "len", "list", "map", "max", "min", "print",
    "range", "repr", "reversed", "round", "set", "sorted", "str", "sum",
    "tuple", "type", "zip", "True", "False", "None",
    "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
    "StopIteration", "ZeroDivisionError", "ArithmeticError", "RuntimeError",
]


def _restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    top_level = name.split(".")[0]
    full = name if name in ALLOWED_TOP_LEVEL_MODULES else top_level
    if top_level not in {m.split(".")[0] for m in ALLOWED_TOP_LEVEL_MODULES}:
        raise ImportError(f"import of '{name}' is not allowed in the sandbox")
    return __import__(name, globals, locals, fromlist, level)


def _build_globals(dataframes: dict[str, list[dict]] | None) -> dict:
    import pandas as pd

    safe_builtins = {n: __builtins__[n] if isinstance(__builtins__, dict) else getattr(__builtins__, n)
                     for n in SAFE_BUILTIN_NAMES}
    safe_builtins["__import__"] = _restricted_import

    namespace: dict = {"__builtins__": safe_builtins, "pd": pd}
    for name, rows in (dataframes or {}).items():
        namespace[name] = pd.DataFrame(rows)
    return namespace


def _collect_artifacts(namespace: dict) -> list[dict]:
    artifacts: list[dict] = []

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight")
            artifacts.append(
                {"type": "image/png", "data": base64.b64encode(buf.getvalue()).decode()}
            )
        plt.close("all")
    except ImportError:
        pass

    try:
        from plotly.graph_objects import Figure

        for value in namespace.values():
            if isinstance(value, Figure):
                artifacts.append({"type": "application/vnd.plotly.v1+json", "data": value.to_json()})
    except ImportError:
        pass

    return artifacts


def _run(code: str, dataframes: dict[str, list[dict]] | None) -> dict:
    stdout_buf = io.StringIO()
    namespace = _build_globals(dataframes)

    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        return {"stdout": "", "result": None, "artifacts": [], "error": f"SyntaxError: {exc}"}

    last_expr = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last_expr = ast.Expression(tree.body.pop().value)

    result = None
    old_stdout = sys.stdout
    sys.stdout = stdout_buf
    try:
        exec(compile(tree, "<sandbox>", "exec"), namespace)
        if last_expr is not None:
            result = eval(compile(last_expr, "<sandbox>", "eval"), namespace)
    except Exception as exc:  # noqa: BLE001 - report any sandboxed error back to caller
        sys.stdout = old_stdout
        return {"stdout": stdout_buf.getvalue(), "result": None, "artifacts": [], "error": f"{type(exc).__name__}: {exc}"}
    finally:
        sys.stdout = old_stdout

    try:
        json.dumps(result)
    except TypeError:
        result = repr(result)

    artifacts = _collect_artifacts(namespace)
    return {"stdout": stdout_buf.getvalue(), "result": result, "artifacts": artifacts, "error": None}


def main() -> None:
    try:
        resource.setrlimit(resource.RLIMIT_AS, (1_610_612_736, 1_610_612_736))  # 1.5GB
        resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    except (ValueError, resource.error):
        pass  # best-effort; not fatal if the platform disallows it

    payload = json.loads(sys.stdin.read())
    output = _run(payload.get("code", ""), payload.get("dataframes"))
    sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    main()

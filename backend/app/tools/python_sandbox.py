"""LangChain tool exposing sandboxed pandas/chart code execution.

Runs LLM-generated code in a separate subprocess (see sandbox_runner.py)
with a restricted builtins/import allowlist, a wall-clock timeout, and no
filesystem/network access from inside the sandbox — see docs/python-sandbox.md.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from langchain_core.tools import tool

from app.core.config import get_settings

RUNNER_PATH = Path(__file__).parent / "sandbox_runner.py"


def run_python_sync(code: str, dataframes: dict[str, list[dict]] | None = None) -> dict[str, Any]:
    settings = get_settings()
    payload = json.dumps({"code": code, "dataframes": dataframes or {}})

    try:
        proc = subprocess.run(
            [sys.executable, "-I", str(RUNNER_PATH)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=settings.sandbox_timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {"stdout": "", "result": None, "artifacts": [], "error": "sandbox execution timed out"}

    if proc.returncode != 0 and not proc.stdout.strip():
        return {"stdout": "", "result": None, "artifacts": [], "error": proc.stderr.strip() or "sandbox process failed"}

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"stdout": proc.stdout, "result": None, "artifacts": [], "error": proc.stderr.strip() or "invalid sandbox output"}


@tool
def run_python(code: str, dataframes: dict[str, list[dict]] | None = None) -> dict[str, Any]:
    """Execute pandas/plotting Python code in an isolated sandbox.

    `code` runs with `pandas` pre-imported as `pd`; `numpy`, `math`,
    `matplotlib.pyplot`, and `plotly` are also importable. `dataframes` maps a
    variable name to a list-of-dicts payload that is materialized as a
    pandas DataFrame under that name before `code` runs. The last expression's
    value is returned as `result`; any matplotlib/plotly figures created are
    returned as base64 PNG or plotly-JSON artifacts.
    """
    return run_python_sync(code, dataframes)

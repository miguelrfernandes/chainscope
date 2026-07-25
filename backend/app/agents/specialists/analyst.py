import json

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import GraphState
from app.core.llm import get_llm
from app.tools.python_sandbox import run_python, run_python_sync

LABEL = "Analyst agent"

SYSTEM_PROMPT = """You are the Analyst agent for ChainScope. You are given the
findings text and raw subgraph query result JSON gathered by other
specialist agents for the user's question, and one tool: run_python, which
executes pandas/matplotlib/plotly code in a sandbox (pandas is pre-imported
as `pd`; numpy/math/matplotlib.pyplot/plotly are importable).

Decide whether a chart or table would materially help answer the question.
If yes: call run_python with code that parses the relevant JSON (it's given
to you inline, not as a file), builds a small DataFrame, and produces either
a matplotlib figure or a plotly Figure assigned to a variable. Keep the code
short and self-contained — don't rely on any external data. If the findings
are already a good direct answer with no useful chart/table (e.g. a single
number), call no tools and simply reply "no artifact needed"."""


async def analyst_node(state: GraphState) -> dict:
    if not state.get("specialist_results"):
        return {"artifacts": [], "steps": []}

    findings = "\n\n".join(f"## {k}\n{v}" for k, v in state["specialist_results"].items())
    raw = "\n\n".join(
        f"## {k} raw query results\n{json.dumps(v)[:4000]}"
        for k, v in state.get("raw_data", {}).items()
        if v
    )

    llm = get_llm(max_tokens=900).bind_tools([run_python])
    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=f"Question: {state['question']}\n\n{findings}\n\n{raw}"),
            ]
        )
    except Exception:  # noqa: BLE001 - a failed/expensive chart step shouldn't sink the whole answer
        return {"artifacts": [], "steps": []}

    if not response.tool_calls:
        return {"artifacts": [], "steps": []}

    steps = [{"agent": LABEL, "text": "Transforming results with pandas..."}]
    artifacts = []
    for call in response.tool_calls:
        if call["name"] != "run_python":
            continue
        code = call["args"].get("code")
        if not code:
            continue
        output = run_python_sync(code, call["args"].get("dataframes"))
        if output.get("error"):
            continue
        for artifact in output.get("artifacts", []):
            artifacts.append(artifact)

    return {"artifacts": artifacts, "steps": steps}

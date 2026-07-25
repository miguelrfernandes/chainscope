import json

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import GraphState, get_history_messages
from app.core.llm import get_llm
from app.tools.python_sandbox import run_python, run_python_sync

LABEL = "Analyst agent"

SYSTEM_PROMPT = """You are the Analyst agent for ChainScope. You are given the
findings text and raw query results JSON gathered by other specialist agents for the user's question, and one tool: run_python, which executes pandas/matplotlib/plotly code in a sandbox (pandas is pre-imported as `pd`; numpy/math/matplotlib.pyplot/plotly are importable).

Your role:
When the user asks for a portfolio breakdown, asset allocation, token balances, distribution, APY comparison, transaction volume, or quantitative analysis, ALWAYS call `run_python` to generate a chart or visual artifact.

Instructions for `run_python`:
1. The raw query results are provided in the prompt as formatted JSON lists/objects (e.g. under `## portfolio raw query results`).
2. Write Python code to parse the raw query results (e.g. `raw_data = [...]`). The raw data contains lists or dicts with token symbols and balance numerical/string values.
3. Convert token balance strings to numeric floats (`df["balance"] = pd.to_numeric(df["balance"], errors="coerce")`).
4. Build a Plotly figure using `plotly.express` (as `px`) or `plotly.graph_objects` (as `go`) or a matplotlib figure.
   - For portfolio/token breakdowns across chains or assets: create a horizontal bar chart (`px.bar(df, x="balance", y="symbol", orientation="h", title=...)`) or a bar chart / donut chart showing token balances.
   - For yield/APY or comparisons: create a bar chart comparing rates or metrics.
   - Assign the Plotly Figure object to a variable named `fig` (e.g. `fig = px.bar(...)`).
5. Ensure the Python code runs cleanly without syntax or type errors.
6. If the findings are a simple non-quantitative response (e.g., answering a pure text policy question or single status check), call no tools and reply "no artifact needed"."""


async def analyst_node(state: GraphState) -> dict:
    if not state.get("specialist_results"):
        return {"artifacts": [], "steps": []}

    findings = "\n\n".join(f"## {k}\n{v}" for k, v in state["specialist_results"].items())

    raw_formatted = []
    for k, v in state.get("raw_data", {}).items():
        if not v:
            continue
        parsed_items = []
        for item in v:
            if isinstance(item, str):
                try:
                    parsed_items.append(json.loads(item))
                except Exception:
                    parsed_items.append(item)
            else:
                parsed_items.append(item)
        raw_formatted.append(f"## {k} raw query results\n{json.dumps(parsed_items, indent=2)[:4000]}")
    raw = "\n\n".join(raw_formatted)

    llm = get_llm(max_tokens=900).bind_tools([run_python])
    history_messages = get_history_messages(state)
    prompt_messages = (
        [SystemMessage(content=SYSTEM_PROMPT)]
        + history_messages
        + [HumanMessage(content=f"Question: {state['question']}\n\n{findings}\n\n{raw}")]
    )
    try:
        response = await llm.ainvoke(prompt_messages)

    except Exception:  # noqa: BLE001 - a failed/expensive chart step shouldn't sink the whole answer
        return {"artifacts": [], "steps": []}

    if not response.tool_calls:
        return {"artifacts": [], "steps": []}

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

    steps = [{"agent": LABEL, "text": "Transforming results with pandas..."}] if artifacts else []
    return {"artifacts": artifacts, "steps": steps}

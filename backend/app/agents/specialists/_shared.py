"""Shared ReAct-agent builder used by every data-fetching specialist.

Each specialist (portfolio/defi_research/risk_monitor/governance) is a small
LangGraph prebuilt ReAct loop bound to a tool list, scoped by its own system
prompt — the prompt is what keeps it querying the right data instead of
guessing (see docs/agents.md).
"""

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt import create_react_agent

from app.agents.state import GraphState
from app.core.llm import get_llm

QUERY_TOOL_NAMES = {"execute_query_by_subgraph_id", "execute_query_by_deployment_id"}
DATA_TOOL_NAMES = QUERY_TOOL_NAMES | {"get_wallet_balances", "get_wallet_transfers"}


def _describe_tool_call(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        target = args.get("subgraph_id") or args.get("deployment_id") or ""
        return f"Querying {target} via Subgraph MCP..."
    if name == "search_subgraphs":
        return f"Searching subgraphs for '{args.get('query', '')}'..."
    if name in {"get_schema_by_subgraph_id", "get_schema_by_deployment_id"}:
        return "Inspecting subgraph schema..."
    if name == "get_top_subgraph_deployments":
        return f"Resolving best-indexed subgraph for {args.get('contract_address', 'contract')}..."
    if name == "get_wallet_balances":
        return f"Fetching wallet balances for {args.get('address', '')} ({args.get('network', 'mainnet')}) via Pinax Token API..."
    if name == "get_wallet_transfers":
        return f"Fetching transfer history for {args.get('address', '')} ({args.get('network', 'mainnet')}) via Pinax Token API..."
    return f"Calling {name}..."


def _source_id(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        return args.get("subgraph_id") or args.get("deployment_id") or ""
    if name in {"get_wallet_balances", "get_wallet_transfers"}:
        return f"pinax/token-api/{name}"
    return name


async def run_specialist(
    state: GraphState, *, key: str, label: str, system_prompt: str, tools: list[BaseTool]
) -> dict:
    agent = create_react_agent(get_llm(), tools=tools, prompt=system_prompt)

    result = await agent.ainvoke({"messages": [HumanMessage(content=state["question"])]})
    messages = result["messages"]

    steps = []
    sources = []
    data_call_ids: dict[str, str] = {}
    raw_results: list[str] = []
    for msg in messages:
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for call in msg.tool_calls:
                steps.append({"agent": label, "text": _describe_tool_call(call["name"], call["args"])})
                if call["name"] in DATA_TOOL_NAMES:
                    sid = _source_id(call["name"], call["args"])
                    sources.append(
                        {
                            "label": label,
                            "id": sid,
                            "query": call["args"].get("query", "") or str(call["args"]),
                        }
                    )
                    data_call_ids[call["id"]] = sid
        elif isinstance(msg, ToolMessage) and msg.tool_call_id in data_call_ids:
            raw_results.append(str(msg.content))

    final_text = next(
        (m.content for m in reversed(messages) if isinstance(m, AIMessage) and m.content), ""
    )

    return {
        "specialist_results": {key: final_text},
        "raw_data": {key: raw_results},
        "steps": steps,
        "sources": sources,
    }

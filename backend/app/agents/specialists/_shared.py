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

QUERY_TOOL_NAMES = {
    "execute_query_by_subgraph_id",
    "execute_query_by_deployment_id",
    "execute_query_by_ipfs_hash",
}
DATA_TOOL_NAMES = QUERY_TOOL_NAMES | {
    "get_wallet_balances",
    "get_wallet_transfers",
    "check_idle_aave_reserves",
}
ACTION_TOOL_NAMES = {"propose_yield_action"}


def _describe_tool_call(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        target = args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
        return f"Querying {target} via Subgraph MCP..."
    if name == "search_subgraphs_by_keyword":
        return f"Searching subgraphs for '{args.get('keyword', '')}'..."
    if name in {"get_schema_by_subgraph_id", "get_schema_by_deployment_id", "get_schema_by_ipfs_hash"}:
        return "Inspecting subgraph schema..."
    if name == "get_top_subgraph_deployments":
        return f"Resolving best-indexed subgraph for {args.get('contract_address', 'contract')}..."
    if name == "get_deployment_30day_query_counts":
        return "Checking subgraph query volume..."
    if name == "get_wallet_balances":
        return f"Fetching wallet balances for {args.get('address', '')} ({args.get('network', 'mainnet')}) via Pinax Token API..."
    if name == "get_wallet_transfers":
        return f"Fetching transfer history for {args.get('address', '')} ({args.get('network', 'mainnet')}) via Pinax Token API..."
    if name == "check_idle_aave_reserves":
        return f"Checking {args.get('wallet_address', '')} for idle Aave v3 Sepolia reserves via live RPC..."
    if name == "propose_yield_action":
        return f"Building Aave v3 Sepolia supply transaction for {args.get('amount', '')} {args.get('asset_symbol', '')}..."
    return f"Calling {name}..."


def _source_id(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        return args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
    if name in {"get_wallet_balances", "get_wallet_transfers"}:
        return f"pinax/token-api/{name}"
    if name == "check_idle_aave_reserves":
        return "aave-v3-sepolia/live-rpc-balances"
    return name


async def run_specialist(
    state: GraphState, *, key: str, label: str, system_prompt: str, tools: list[BaseTool]
) -> dict:
    agent = create_react_agent(get_llm(), tools=tools, prompt=system_prompt)

    result = await agent.ainvoke({"messages": [HumanMessage(content=state["question"])]})
    messages = result["messages"]

    steps = []
    sources = []
    artifacts = []
    data_call_ids: dict[str, str] = {}
    action_call_ids: set[str] = set()
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
                if call["name"] in ACTION_TOOL_NAMES:
                    action_call_ids.add(call["id"])
        elif isinstance(msg, ToolMessage):
            if msg.tool_call_id in data_call_ids:
                raw_results.append(str(msg.content))
            elif msg.tool_call_id in action_call_ids:
                artifacts.append({"type": "action/yield-supply", "data": str(msg.content)})

    final_text = next(
        (m.content for m in reversed(messages) if isinstance(m, AIMessage) and m.content), ""
    )

    return {
        "specialist_results": {key: final_text},
        "raw_data": {key: raw_results},
        "steps": steps,
        "sources": sources,
        "artifacts": artifacts,
    }

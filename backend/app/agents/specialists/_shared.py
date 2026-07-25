"""Shared ReAct-agent builder used by every data-fetching specialist.

Each specialist (portfolio/defi_research/risk_monitor/governance) is a small
LangGraph prebuilt ReAct loop bound to a tool list, scoped by its own system
prompt — the prompt is what keeps it querying the right data instead of
guessing (see docs/agents.md).
"""

import json

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode, create_react_agent

from app.agents.state import GraphState, get_conversation_messages
from app.core.llm import get_llm

QUERY_TOOL_NAMES = {
    "execute_query_by_subgraph_id",
    "execute_query_by_deployment_id",
    "execute_query_by_ipfs_hash",
}
HEDERA_TOOL_NAMES = {
    "get_hedera_account",
    "get_hedera_account_tokens",
    "get_hedera_account_nfts",
    "get_hedera_account_transactions",
    "get_hedera_token_info",
    "get_hedera_topic_messages",
}
DATA_TOOL_NAMES = (
    QUERY_TOOL_NAMES
    | HEDERA_TOOL_NAMES
    | {
        "get_wallet_balances",
        "get_wallet_transfers",
        "check_idle_aave_reserves",
        "get_saucerswap_pool_aprs",
        "get_uniswap_quote",
    }
)
HEDERA_ACTION_TOOL_NAMES = {
    "transfer_hbar_tool",
    "create_topic_tool",
    "submit_topic_message_tool",
    "create_fungible_token_tool",
    "mint_fungible_token_tool",
    "associate_token_tool",
}
# Action tool -> artifact type shown to the frontend. yield_advisor's action
# is a *proposed* tx the user's own wallet still has to sign; Hedera actions
# have already executed (AUTONOMOUS mode, backend-held testnet operator) by
# the time the tool returns, hence the different artifact type.
ACTION_ARTIFACT_TYPES = {
    "propose_yield_action": "action/yield-supply",
    "provision_hedera_agent": "action/seed-agent-hbar",
    **{name: "action/hedera-tx" for name in HEDERA_ACTION_TOOL_NAMES},
}


def _describe_tool_call(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        target = args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
        return (
            f"Querying {target} on The Graph via Subgraph MCP..."
            if target
            else "Querying subgraph on The Graph via Subgraph MCP..."
        )
    if name == "search_subgraphs_by_keyword":
        return f"Searching subgraphs on The Graph for '{args.get('keyword', '')}'..."
    if name in {
        "get_schema_by_subgraph_id",
        "get_schema_by_deployment_id",
        "get_schema_by_ipfs_hash",
    }:
        target = args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
        return f"Inspecting subgraph schema on The Graph{f' ({target})' if target else ''}..."
    if name == "get_top_subgraph_deployments":
        return f"Resolving best-indexed subgraph on The Graph for {args.get('contract_address', 'contract')}..."
    if name == "get_deployment_30day_query_counts":
        return "Checking subgraph query volume on The Graph..."
    if name == "get_wallet_balances":
        return f"Fetching wallet balances for {args.get('address', '')} ({args.get('network', 'sepolia')}) via Pinax Token API..."
    if name == "get_wallet_transfers":
        return f"Fetching transfer history for {args.get('address', '')} ({args.get('network', 'sepolia')}) via Pinax Token API..."
    if name == "check_idle_aave_reserves":
        return f"Checking {args.get('wallet_address', '')} for idle Aave v3 Sepolia reserves via live RPC..."
    if name == "get_saucerswap_pool_aprs":
        return "Fetching SaucerSwap farms/pools/token prices to compute pool APRs..."
    if name == "build_saucerswap_swap_tx":
        return f"Building SaucerSwap V2 swap: {args.get('amount_in', '')} {args.get('token_in_id', '')} -> {args.get('token_out_id', '')}..."
    if name == "get_uniswap_quote":
        return f"Fetching quote for {args.get('amount_in', '')} ({args.get('token_in_address', '')} -> {args.get('token_out_address', '')}) via Uniswap Trading API..."
    if name == "build_uniswap_swap_tx":
        return f"Building Uniswap swap: {args.get('amount_in', '')} ({args.get('token_in_address', '')} -> {args.get('token_out_address', '')}) via Trading API..."
    if name == "propose_yield_action":
        return f"Building Aave v3 Sepolia supply transaction for {args.get('amount', '')} {args.get('asset_symbol', '')}..."
    if name == "provision_hedera_agent":
        return f"Generating ECDSA keypair for agent '{args.get('name', '')}' (account auto-created on seed funding)..."
    if name in HEDERA_TOOL_NAMES:
        target = args.get("account_id") or args.get("token_id") or args.get("topic_id") or ""
        return f"Querying Hedera Mirror Node ({name}) for {target}..."
    if name in HEDERA_ACTION_TOOL_NAMES:
        readable = name.removesuffix("_tool").replace("_", " ")
        return f"Executing Hedera {readable} on testnet (backend operator account)..."
    return f"Calling {name}..."


def _friendly_hedera_action_message(name: str, args: dict) -> str:
    """Builds a plain-English description of a Hedera action tool call, to
    replace the Agent Kit's own RETURN_BYTES human_message — which is
    literally `f"Transaction bytes: {str(tx.to_bytes())}"` (see the
    installed package's ReturnBytesStrategy.handle) and dumps a raw Python
    bytes repr straight into the chat UI otherwise."""
    if name == "transfer_hbar_tool":
        transfers = args.get("transfers") or []
        parts = ", ".join(f"{t.get('amount')} HBAR to {t.get('account_id')}" for t in transfers)
        return f"Transfer {parts}" if parts else "HBAR transfer"
    if name == "create_topic_tool":
        memo = args.get("topic_memo")
        return f"Create a new HCS topic{f' ({memo})' if memo else ''}"
    if name == "submit_topic_message_tool":
        topic_id = args.get("topic_id", "")
        message = args.get("message", "")
        preview = message if len(message) <= 60 else f"{message[:57]}..."
        return f'Submit message to topic {topic_id}: "{preview}"'
    if name == "create_fungible_token_tool":
        return (
            f"Create fungible token {args.get('token_name', '')} ({args.get('token_symbol', '')})"
        )
    if name == "mint_fungible_token_tool":
        return f"Mint {args.get('amount', '')} of token {args.get('token_id', '')}"
    if name == "associate_token_tool":
        token_ids = ", ".join(args.get("token_ids") or [])
        return f"Associate token(s) {token_ids} with your account"
    return "Transaction ready to sign"


def _source_id(name: str, args: dict) -> str:
    if name in QUERY_TOOL_NAMES:
        return args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
    if name in {"get_wallet_balances", "get_wallet_transfers"}:
        return f"pinax/token-api/{name}"
    if name == "check_idle_aave_reserves":
        return "aave-v3-sepolia/live-rpc-balances"
    if name == "get_saucerswap_pool_aprs":
        return "saucerswap/rest-api/farms-pools-tokens"
    if name == "get_uniswap_quote":
        return "uniswap/trading-api/quote"
    if name in HEDERA_TOOL_NAMES:
        return f"hedera-mirror-node/{name}"
    return name


async def run_specialist(
    state: GraphState,
    *,
    key: str,
    label: str,
    system_prompt: str,
    tools: list[BaseTool],
    action_artifact_types: dict[str, str] | None = None,
) -> dict:
    """`action_artifact_types` lets a specialist override the artifact type for
    its own action tool calls, on top of ACTION_ARTIFACT_TYPES — needed
    because the Hedera AUTONOMOUS and RETURN_BYTES tool sets share the exact
    same tool names (e.g. "transfer_hbar_tool") but mean different things:
    one already executed, the other needs the user's wallet to sign the
    returned bytes (see hedera_action.py vs hedera_wallet_action.py)."""
    artifact_types = {**ACTION_ARTIFACT_TYPES, **(action_artifact_types or {})}
    tool_node = ToolNode(tools, handle_tool_errors=True)
    agent = create_react_agent(
        get_llm(),
        tools=tool_node,
        prompt=system_prompt,
    )
    conv_messages = get_conversation_messages(state)
    result = await agent.ainvoke(
        {"messages": conv_messages},
        config={"recursion_limit": 15},
    )
    all_messages = result["messages"]
    new_messages = (
        all_messages[len(conv_messages):]
        if len(all_messages) >= len(conv_messages)
        else all_messages
    )

    steps = []
    sources = []
    artifacts = []
    data_call_ids: dict[str, str] = {}
    action_call_ids: dict[str, str] = {}
    action_call_args: dict[str, dict] = {}
    raw_results: list[str] = []
    for msg in new_messages:
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for call in msg.tool_calls:
                steps.append(
                    {"agent": label, "text": _describe_tool_call(call["name"], call["args"])}
                )
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
                if call["name"] in artifact_types:
                    action_call_ids[call["id"]] = call["name"]
                    action_call_args[call["id"]] = call["args"]
        elif isinstance(msg, ToolMessage):
            if msg.tool_call_id in data_call_ids:
                raw_results.append(str(msg.content))
            elif msg.tool_call_id in action_call_ids:
                name = action_call_ids[msg.tool_call_id]
                artifact_type = artifact_types[name]
                content = str(msg.content)
                if name in HEDERA_ACTION_TOOL_NAMES:
                    try:
                        payload = json.loads(content)
                    except (json.JSONDecodeError, TypeError):
                        payload = None
                    if isinstance(payload, dict) and payload.get("bytes_data"):
                        payload["human_message"] = _friendly_hedera_action_message(
                            name, action_call_args[msg.tool_call_id]
                        )
                        content = json.dumps(payload)
                artifacts.append({"type": artifact_type, "data": content})

    final_text = next(
        (m.content for m in reversed(new_messages) if isinstance(m, AIMessage) and m.content), ""
    )
    if not final_text:
        final_text = next(
            (m.content for m in reversed(all_messages) if isinstance(m, AIMessage) and m.content), ""
        )

    return {
        "specialist_results": {key: final_text},
        "raw_data": {key: raw_results},
        "steps": steps,
        "sources": sources,
        "artifacts": artifacts,
    }

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
        "check_aave_positions",
        "get_saucerswap_pool_aprs",
        "get_uniswap_quote",
        "get_uniswap_v3_pool_aprs",
    }
)
HEDERA_ACTION_TOOL_NAME_STRINGS = {
    "transfer_hbar_tool",
    "create_topic_tool",
    "submit_topic_message_tool",
    "create_fungible_token_tool",
    "mint_fungible_token_tool",
    "associate_token_tool",
}

# Per-tool metadata for named (non-group) tools: how to describe a call in
# the step list, and what source-id to record for it (if it's a data tool).
# Keeping this as one dict-per-tool instead of three separately-maintained
# if/elif chains means adding/renaming a tool only has one place to update.
TOOL_METADATA: dict[str, dict] = {
    "get_wallet_balances": {
        "describe": lambda a: (
            f"Fetching wallet balances for {a.get('address', '')} ({a.get('network', 'sepolia')}) via Pinax Token API..."
        ),
        "source_id": lambda a: "pinax/token-api/get_wallet_balances",
    },
    "get_wallet_transfers": {
        "describe": lambda a: (
            f"Fetching transfer history for {a.get('address', '')} ({a.get('network', 'sepolia')}) via Pinax Token API..."
        ),
        "source_id": lambda a: "pinax/token-api/get_wallet_transfers",
    },
    "check_aave_positions": {
        "describe": lambda a: (
            f"Checking Aave v3 Sepolia positions for {a.get('wallet_address', '')} via live RPC..."
        ),
        "source_id": lambda a: "aave-v3-sepolia/live-rpc-atokens",
    },
    "get_saucerswap_pool_aprs": {
        "describe": lambda a: (
            "Fetching SaucerSwap farms/pools/token prices to compute pool APRs..."
        ),
        "source_id": lambda a: "saucerswap/rest-api/farms-pools-tokens",
    },
    "build_saucerswap_swap_tx": {
        "describe": lambda a: (
            f"Building SaucerSwap V2 swap: {a.get('amount_in', '')} {a.get('token_in_id', '')} -> {a.get('token_out_id', '')}..."
        ),
    },
    "get_uniswap_quote": {
        "describe": lambda a: (
            f"Fetching quote for {a.get('amount_in', '')} ({a.get('token_in_address', '')} -> {a.get('token_out_address', '')}) via Uniswap Trading API..."
        ),
        "source_id": lambda a: "uniswap/trading-api/quote",
    },
    "build_uniswap_swap_tx": {
        "describe": lambda a: (
            f"Building Uniswap swap: {a.get('amount_in', '')} ({a.get('token_in_address', '')} -> {a.get('token_out_address', '')}) via Trading API..."
        ),
    },
    "get_uniswap_v3_pool_aprs": {
        "describe": lambda a: (
            f"Querying Uniswap v3 pool APRs for {a.get('token_address', '')} (chain {a.get('chain_id', 1)}) via The Graph..."
        ),
        "source_id": lambda a: f"uniswap-v3/the-graph/pool-aprs/chain-{a.get('chain_id', 1)}",
    },
    "build_uniswap_lp_tx": {
        "describe": lambda a: (
            f"Building Uniswap v3 addLiquidity tx ({(a.get('fee_tier', 3000) or 3000) / 10_000:.2f}% pool, {a.get('amount0_desired', '')} + {a.get('amount1_desired', '')}..."
        ),
        "artifact_type": "action/evm-tx-batch",
    },
    "propose_yield_action": {
        "describe": lambda a: (
            f"Building Aave v3 Sepolia supply transaction for {a.get('amount', '')} {a.get('asset_symbol', '')}..."
        ),
        "artifact_type": "action/yield-supply",
    },
    "provision_hedera_agent": {
        "describe": lambda a: (
            f"Generating ECDSA keypair for agent '{a.get('name', '')}' (account auto-created on seed funding)..."
        ),
        "artifact_type": "action/seed-agent-hbar",
    },
}

# Action tool -> artifact type shown to the frontend. yield_advisor's action
# is a *proposed* tx the user's own wallet still has to sign; Hedera actions
# have already executed (AUTONOMOUS mode, backend-held testnet operator) by
# the time the tool returns, hence the different artifact type.
ACTION_ARTIFACT_TYPES = {
    **{
        name: meta["artifact_type"]
        for name, meta in TOOL_METADATA.items()
        if "artifact_type" in meta
    },
    **{name: "action/hedera-tx" for name in HEDERA_ACTION_TOOL_NAME_STRINGS},
}


def _describe_tool_call(name: str, args: dict) -> str:
    if name in TOOL_METADATA:
        return TOOL_METADATA[name]["describe"](args)
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
    if name in HEDERA_TOOL_NAMES:
        target = args.get("account_id") or args.get("token_id") or args.get("topic_id") or ""
        return f"Querying Hedera Mirror Node ({name}) for {target}..."
    if name in HEDERA_ACTION_TOOL_NAME_STRINGS:
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
    if name in TOOL_METADATA and "source_id" in TOOL_METADATA[name]:
        return TOOL_METADATA[name]["source_id"](args)
    if name in QUERY_TOOL_NAMES:
        return args.get("subgraph_id") or args.get("deployment_id") or args.get("ipfs_hash") or ""
    if name in HEDERA_TOOL_NAMES:
        return f"hedera-mirror-node/{name}"
    return name


# Tools whose source id is an actual Graph subgraph (safe to link to
# thegraph.com's explorer search). Everything else — REST APIs, live RPC
# calls, Hedera Mirror Node, etc. — isn't indexed there, so the frontend
# must not send those through the same "search on The Graph" link.
_SUBGRAPH_TOOL_NAMES = QUERY_TOOL_NAMES | {"get_uniswap_v3_pool_aprs"}


def _source_kind(name: str) -> str:
    return "subgraph" if name in _SUBGRAPH_TOOL_NAMES else "other"


async def run_specialist(
    state: GraphState,
    *,
    key: str,
    label: str,
    system_prompt: str,
    tools: list[BaseTool],
    action_artifact_types: dict[str, str] | None = None,
    recursion_limit: int = 30,
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
        config={"recursion_limit": recursion_limit},
    )
    all_messages = result["messages"]
    new_messages = (
        all_messages[len(conv_messages) :]
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
                            "kind": _source_kind(call["name"]),
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
                if name in HEDERA_ACTION_TOOL_NAME_STRINGS:
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
            (m.content for m in reversed(all_messages) if isinstance(m, AIMessage) and m.content),
            "",
        )

    return {
        "specialist_results": {key: final_text},
        "raw_data": {key: raw_results},
        "steps": steps,
        "sources": sources,
        "artifacts": artifacts,
    }

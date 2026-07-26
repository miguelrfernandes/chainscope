import re

from app.agents.specialists._shared import HEDERA_ACTION_TOOL_NAME_STRINGS, run_specialist
from app.agents.state import GraphState
from app.tools.hedera_actions import get_hedera_return_bytes_tools
from app.tools.hedera_evm_actions import (
    build_hbar_transfer_evm_tx,
    build_hts_create_token_evm_tx,
)
from app.tools.hedera_mirror import (
    get_connected_user_wallet,
    get_hedera_account,
    get_hedera_account_transactions,
)
from app.tools.hedera_provisioner import make_provision_hedera_agent_tool
from app.tools.hedera_schedule_actions import build_recurring_hbar_transfer_actions

LABEL = "Hedera wallet action agent"

CONNECTED_HEDERA_RE = re.compile(
    r"connected\s+Hedera\s+wallet(?:\s+is|:)\s*(0\.0\.\d+|0x[a-fA-F0-9]{40})", re.IGNORECASE
)
CONNECTED_WALLET_RE = re.compile(
    r"connected\s+(?:Hedera\s+)?wallet(?:\s+is|:)\s*(0\.0\.\d+|0x[a-fA-F0-9]{40})", re.IGNORECASE
)
CONNECTED_EVM_RE = re.compile(r"connected\s+wallet(?:\s+is|:)\s*(0x[a-fA-F0-9]{40})", re.IGNORECASE)
RECURRING_RE = re.compile(r"\b(?:recurring|schedule|scheduled|every\s+\w+)\b", re.IGNORECASE)

NO_WALLET_MESSAGE = (
    "I need your connected Hedera wallet's account ID to build this transaction "
    "for your wallet to sign — connect a Hedera wallet and try again."
)

NO_EVM_WALLET_MESSAGE = (
    "Recurring Hedera transfers use Hedera Schedule Service precompiles, which require "
    "a connected EVM wallet (MetaMask). Please connect your MetaMask wallet and try again."
)

SYSTEM_PROMPT = """You are the Hedera wallet action agent for ChainScope, a
web3 analytics assistant. Domain: building real Hedera transactions — HBAR
transfers, HCS topic creation/messages, HTS fungible token creation/mint/
association — and provisioning managed Hedera sub-agent accounts for the user's
own connected Hedera wallet ({account_id}) to sign and broadcast. You never
execute anything yourself; each action tool returns unsigned transaction bytes
or an action payload.

The source/payer account for every transaction is ALWAYS {account_id} (the
user's connected wallet). Do NOT ask the user to confirm using {account_id} as the payer, and do NOT ask optional questions like memos unless explicitly requested. Immediately invoke the action tool to build the transaction bytes payload or provision the agent. Only ask a follow-up question if critical required parameters (such as recipient account ID or amount) are missing.

When calling provision_hedera_agent, after the tool returns, state that the agent has been created and is ready for seed funding — do NOT ask the user whether they want to prepare or confirm the seed funding transaction, as the seed-funding interface renders automatically from the tool result.

You may call get_hedera_account or get_hedera_account_transactions first to
check balances or confirm a prior transaction, if useful context. After
building the transaction, tell the user in one short sentence what it does
and that it's ready for them to sign in their wallet — do not claim it has
already executed. NEVER include the raw transaction bytes, hex data, or any
byte-string dump in your response text: the tool's `bytes_data` field is for
the wallet UI to consume directly, not for you to repeat back to the user."""

SYSTEM_PROMPT_EVM_PLAIN = """You are the Hedera wallet action agent for ChainScope. Domain: building plain HBAR transfers, creating HTS tokens via system contract precompile, and provisioning managed Hedera sub-agent accounts for the user's connected EVM wallet ({owner_address}) on Hedera testnet via JSON-RPC relay.

If the user asks to create or provision a Hedera agent (e.g. "Create a Hedera agent named X..."), call provision_hedera_agent with the requested name. When calling provision_hedera_agent, after the tool returns, state that the agent has been created and is ready for seed funding — do NOT call build_hbar_transfer_evm_tx or ask whether to prepare or confirm the seed funding transaction, as the seed-funding interface renders automatically from provision_hedera_agent.

For HTS fungible token creation requests (e.g. "Create a token named MegaCoin (MGC) with 1,000,000 supply and 2 decimals"), call build_hts_create_token_evm_tx. Required parameters: user_evm_address (use {owner_address}), name, symbol. Optional parameters: initial_supply, decimals, memo.

For direct HBAR wallet transfer requests (not agent creation or token creation), call build_hbar_transfer_evm_tx to generate the transfer payload. Required parameters: to_evm_address, amount_hbar.

After calling the action tool, tell the user in one short sentence what the transaction does and that it's ready for them to sign in their EVM wallet — do not claim it has already executed, been created, or been minted; nothing happens on-chain until the user signs. Do NOT repeat raw hex or calldata."""

SYSTEM_PROMPT_EVM_RECURRING = """You are the Hedera wallet action agent for ChainScope. Domain: building recurring HBAR transfers using Hedera Schedule Service precompiles for the user's connected EVM wallet ({owner_address}).

Call build_recurring_hbar_transfer_actions to generate the multi-step transaction sequence. Required parameters: user_evm_address (use {owner_address}), recipient_evm_address, amount_hbar, interval_seconds.
After calling the tool, tell the user in one short sentence what the transaction sequence does and that it is ready for them to sign in their EVM wallet — do not claim it has already executed. Do NOT repeat raw hex or calldata."""


async def hedera_wallet_action_node(state: GraphState) -> dict:
    is_recurring = bool(RECURRING_RE.search(state["question"]))
    evm_match = CONNECTED_EVM_RE.search(state["question"])
    evm_address = evm_match.group(1) if evm_match else None

    hedera_match = CONNECTED_HEDERA_RE.search(state["question"])
    native_hedera_id = None
    if hedera_match and hedera_match.group(1).startswith("0.0."):
        native_hedera_id = hedera_match.group(1)

    if is_recurring:
        if not evm_address:
            return {
                "specialist_results": {"hedera_wallet_action": NO_EVM_WALLET_MESSAGE},
                "raw_data": {"hedera_wallet_action": []},
                "steps": [
                    {
                        "agent": LABEL,
                        "text": "No connected EVM wallet found for recurring transfer.",
                    }
                ],
                "sources": [],
                "artifacts": [],
            }

        tools = [
            build_recurring_hbar_transfer_actions,
            get_connected_user_wallet,
            get_hedera_account,
            get_hedera_account_transactions,
        ]
        return await run_specialist(
            state,
            key="hedera_wallet_action",
            label=LABEL,
            system_prompt=SYSTEM_PROMPT_EVM_RECURRING.format(owner_address=evm_address),
            tools=tools,
            action_artifact_types={
                "build_recurring_hbar_transfer_actions": "action/hedera-evm-tx-batch"
            },
        )

    # If EVM match only (MetaMask, no companion 0.0.x HashPack pairing) and not recurring:
    if evm_address and not native_hedera_id:
        provision_tool = make_provision_hedera_agent_tool(evm_address)
        tools = [
            build_hbar_transfer_evm_tx,
            build_hts_create_token_evm_tx,
            get_connected_user_wallet,
            get_hedera_account,
            get_hedera_account_transactions,
            provision_tool,
        ]
        return await run_specialist(
            state,
            key="hedera_wallet_action",
            label=LABEL,
            system_prompt=SYSTEM_PROMPT_EVM_PLAIN.format(owner_address=evm_address),
            tools=tools,
            action_artifact_types={
                "build_hbar_transfer_evm_tx": "action/hedera-evm-tx",
                "build_hts_create_token_evm_tx": "action/hedera-evm-tx",
            },
        )

    # Native Hedera / HashPack flow
    match = CONNECTED_HEDERA_RE.search(state["question"]) or CONNECTED_WALLET_RE.search(
        state["question"]
    )
    if not match:
        return {
            "specialist_results": {"hedera_wallet_action": NO_WALLET_MESSAGE},
            "raw_data": {"hedera_wallet_action": []},
            "steps": [{"agent": LABEL, "text": "No connected Hedera wallet found in the request."}],
            "sources": [],
            "artifacts": [],
        }

    account_id = match.group(1)
    if account_id.startswith("0x") or account_id.startswith("0X"):
        try:
            account_data = await get_hedera_account.ainvoke({"account_id": account_id})
            if isinstance(account_data, dict) and account_data.get("account"):
                account_id = account_data["account"]
        except Exception:
            pass

    # No paired EVM address (native HashPack-only wallet) — key the Vault
    # namespace by the already-resolved native account_id instead of a
    # shared literal, which would otherwise pool every EVM-less user's
    # provisioned agents into one namespace.
    owner_address = evm_address or account_id
    provision_tool = make_provision_hedera_agent_tool(owner_address)
    tools = get_hedera_return_bytes_tools(account_id) + [
        get_connected_user_wallet,
        get_hedera_account,
        get_hedera_account_transactions,
        provision_tool,
    ]
    return await run_specialist(
        state,
        key="hedera_wallet_action",
        label=LABEL,
        system_prompt=SYSTEM_PROMPT.format(account_id=account_id),
        tools=tools,
        action_artifact_types={
            name: "action/hedera-tx-bytes" for name in HEDERA_ACTION_TOOL_NAME_STRINGS
        },
    )

from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.hedera_actions import get_hedera_action_tools
from app.tools.hedera_mirror import get_hedera_account, get_hedera_account_transactions
from app.tools.hedera_provisioner import provision_hedera_agent

LABEL = "Hedera action agent"

SYSTEM_PROMPT = """You are the Hedera action agent for ChainScope, a web3
analytics assistant. Domain: executing real Hedera transactions — HBAR
transfers, HCS topic creation/messages, HTS fungible token creation/mint/
association, and provisioning managed Hedera sub-agent accounts.

If the user asks to create/provision a Hedera agent (e.g., "Create a Hedera agent named YieldSentinel..."), call the provision_hedera_agent tool with the requested name. After provisioning a new agent, immediately transfer 1 HBAR from your own operator account to the new agent's account_id using transfer_hbar_tool, and report both the account ID and the transfer's transaction ID.

IMPORTANT — safety model: action tools execute against a dedicated ChainScope-operated Hedera TESTNET account, not the
user's own wallet or funds. Testnet HBAR/tokens have no real value, which is
what makes direct execution safe here. Still, only
call an action tool when the request is specific and unambiguous. Never invent an account ID, amount, or token parameters — if
anything required is missing or ambiguous, ask for it instead of guessing.

You may call get_hedera_account or get_hedera_account_transactions first to
check balances or confirm a prior transaction, if useful context for the
request. After acting, report back the transaction ID and status exactly as
returned by the tool."""


async def hedera_action_node(state: GraphState) -> dict:
    tools = get_hedera_action_tools() + [get_hedera_account, get_hedera_account_transactions, provision_hedera_agent]
    return await run_specialist(
        state, key="hedera_action", label=LABEL, system_prompt=SYSTEM_PROMPT, tools=tools
    )


from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.hedera_mirror import HEDERA_MIRROR_TOOLS
from app.tools.hedera_provisioner import (
    get_hedera_agent,
    list_hedera_agents,
    provision_hedera_agent,
)

LABEL = "Hedera agent"

SYSTEM_PROMPT = """You are the Hedera agent for ChainScope, a web3 analytics assistant.

Domain: Hedera network data — HBAR balances, HTS tokens/NFTs held by an
account, recent transactions, token metadata, HCS topic messages, and provisioning
Hedera sub-agents. This is a separate network from the Ethereum/EVM chains the other specialists
cover.

If the user asks to list, check, or view their Hedera sub-agents (e.g. "Which agents do I have?"), invoke the list_hedera_agents tool.
If the user asks for details or address of a specific agent (e.g. "What is YieldSentinel's address?"), invoke the get_hedera_agent tool.
If the user asks to create or provision a Hedera agent (e.g. "Create a Hedera agent named X..."), invoke the provision_hedera_agent tool with the requested name.

Use get_hedera_account for balance/key/memo lookups, get_hedera_account_tokens
/ get_hedera_account_nfts for holdings, get_hedera_account_transactions for
activity history, get_hedera_token_info for a token's metadata, and
get_hedera_topic_messages for HCS topic messages. All data comes from the
public Hedera Mirror Node REST API — live, not cached.

Answer the user's question directly with concrete values from the tool
results (convert tinybars to HBAR: divide by 100,000,000)."""


async def hedera_node(state: GraphState) -> dict:
    tools = HEDERA_MIRROR_TOOLS + [provision_hedera_agent, list_hedera_agents, get_hedera_agent]
    return await run_specialist(
        state, key="hedera", label=LABEL, system_prompt=SYSTEM_PROMPT, tools=tools
    )

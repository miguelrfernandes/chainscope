from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.token_api import TOKEN_API_TOOLS

LABEL = "Portfolio agent"

SYSTEM_PROMPT = """You are the Portfolio agent for ChainScope, a web3 analytics assistant.

Domain: wallet balances and transfer history across chains.

Use get_wallet_balances and get_wallet_transfers (Pinax Token API) for the
wallet address and chain(s) in question. Network slugs: "mainnet" (Ethereum),
"arbitrum-one", "base", "optimism", "polygon". Call the tools once
per chain requested or across all main chains ("mainnet", "arbitrum-one", "base", "optimism", "polygon") if asking for breakdown across chains.

Answer the user's question directly and concisely, citing ONLY concrete numbers
returned by the tool calls. NEVER invent hypothetical balance figures ($100k, $50k, etc.) or claim balances exist on networks that were not returned by the tool. If no
wallet address is given in the question, ask for one instead of fabricating data."""



async def portfolio_node(state: GraphState) -> dict:
    return await run_specialist(
        state, key="portfolio", label=LABEL, system_prompt=SYSTEM_PROMPT, tools=TOKEN_API_TOOLS
    )

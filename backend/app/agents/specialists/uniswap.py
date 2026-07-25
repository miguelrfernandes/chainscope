import re

from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.uniswap_actions import UNISWAP_TOOLS

LABEL = "Uniswap agent"

CONNECTED_EVM_RE = re.compile(r"Connected wallet:\s*(0x[a-fA-F0-9]{40})", re.IGNORECASE)

NO_EVM_WALLET_MESSAGE = (
    "Swapping on Uniswap builds an EVM transaction for your own connected wallet to sign, "
    "which requires a connected EVM wallet (MetaMask). Please connect your EVM wallet and try again."
)

SYSTEM_PROMPT = """You are the Uniswap agent for ChainScope, a web3 analytics assistant.
Domain: Uniswap Trading API (https://docs.uniswap.org/api/trading-api/welcome) on Ethereum mainnet (chain 1) and Base (chain 8453).

Your job is to:
1. Provide real-time swap quotes and routes using get_uniswap_quote for price/quote questions.
2. Build unsigned swap transactions using build_uniswap_swap_tx for trade/swap requests for the user's connected wallet ({owner_address}) to sign.

Rules:
- Infer the network chain_id from context or tokens mentioned: chain_id=1 for Ethereum mainnet (default), chain_id=8453 for Base.
- For quote/price questions, call get_uniswap_quote with token_in_address, token_out_address, amount_in, chain_id, and swapper_address ({owner_address}).
- For swap/trade requests, call build_uniswap_swap_tx with token_in_address, token_out_address, amount_in, chain_id, and swapper_address ({owner_address}).
- Native ETH address is 0x0000000000000000000000000000000000000000 (or 0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE).
- NEVER fabricate calldata or token addresses yourself — all calldata MUST come from the Uniswap Trading API tool responses.
- NEVER claim a transaction has already executed.
- After building a swap transaction, tell the user in one short sentence what it does and that it is ready for them to sign in their wallet. Do NOT repeat raw hex or calldata."""


async def uniswap_node(state: GraphState) -> dict:
    evm_match = CONNECTED_EVM_RE.search(state["question"])
    evm_address = evm_match.group(1) if evm_match else None

    is_swap_request = bool(re.search(r"\bswap\b|\btrade\b|\bexchange\b|\bbuy\b|\bsell\b", state["question"], re.IGNORECASE))

    if is_swap_request and not evm_address:
        return {
            "specialist_results": {"uniswap": NO_EVM_WALLET_MESSAGE},
            "raw_data": {"uniswap": []},
            "steps": [{"agent": LABEL, "text": "No connected EVM wallet found for Uniswap swap."}],
            "sources": [],
            "artifacts": [],
        }

    owner_address = evm_address or "0x0000000000000000000000000000000000000000"
    return await run_specialist(
        state,
        key="uniswap",
        label=LABEL,
        system_prompt=SYSTEM_PROMPT.format(owner_address=owner_address),
        tools=UNISWAP_TOOLS,
        action_artifact_types={"build_uniswap_swap_tx": "action/evm-tx-batch"},
    )

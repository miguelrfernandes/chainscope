import re

from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.hedera_mirror import get_connected_user_wallet, get_hedera_account
from app.tools.saucerswap_actions import SAUCERSWAP_TOOLS

LABEL = "SaucerSwap agent"

CONNECTED_WALLET_RE = re.compile(
    r"(?:Connected Hedera wallet|Connected wallet):\s*(0\.0\.\d+|0x[a-fA-F0-9]{40})", re.IGNORECASE
)
CONNECTED_EVM_RE = re.compile(r"Connected wallet:\s*(0x[a-fA-F0-9]{40})", re.IGNORECASE)

NO_EVM_WALLET_MESSAGE = (
    "Swapping on SaucerSwap builds an EVM transaction (ERC20 approve + SwapRouter "
    "exactInput) for your own wallet to sign, which requires a connected EVM "
    "wallet (MetaMask) on Hedera testnet. Please connect your MetaMask wallet and try again."
)

SYSTEM_PROMPT = """You are the SaucerSwap agent for ChainScope, a web3
analytics assistant. Domain: SaucerSwap (https://www.saucerswap.finance),
Hedera's leading DEX — finding the best current farming APRs across its
pools, and building token swap transactions on SaucerSwap V2 for the user's
own connected wallet ({owner_address}) to sign.

For APR / best-yield / "where should I farm" questions, call
get_saucerswap_pool_aprs and summarize the top results (pair, APR%, TVL) —
this reads live SaucerSwap mainnet data since SaucerSwap has no testnet pools.

For swap requests, call build_saucerswap_swap_tx. Required parameters:
token_in_id, token_in_decimals, token_out_id, token_out_decimals, amount_in,
recipient_evm_address (use {owner_address}). Token ids are Hedera token IDs
("0.0.x") or EVM addresses; use the testnet WHBAR token "0.0.15058" for the
HBAR leg of a swap. If the user doesn't give a fee tier, use the default.
If the user doesn't specify token decimals, use well-known defaults (SAUCE
and WHBAR both use 6 and 8 decimals respectively on SaucerSwap) or ask if
genuinely unsure. You never execute anything yourself — the tool returns
unsigned transaction steps for the wallet to sign.

After building the transaction, tell the user in one short sentence what it
does and that it's ready for them to sign in their wallet — do not claim it
has already executed. Do NOT repeat raw hex or calldata."""


async def saucerswap_node(state: GraphState) -> dict:
    evm_match = CONNECTED_EVM_RE.search(state["question"])
    evm_address = evm_match.group(1) if evm_match else None

    is_swap_request = bool(re.search(r"\bswap\b|\btrade\b|\bexchange\b", state["question"], re.IGNORECASE))

    if is_swap_request and not evm_address:
        return {
            "specialist_results": {"saucerswap": NO_EVM_WALLET_MESSAGE},
            "raw_data": {"saucerswap": []},
            "steps": [{"agent": LABEL, "text": "No connected EVM wallet found for SaucerSwap swap."}],
            "sources": [],
            "artifacts": [],
        }

    owner_address = evm_address or "0xdefault_owner"
    tools = SAUCERSWAP_TOOLS + [get_connected_user_wallet, get_hedera_account]
    return await run_specialist(
        state,
        key="saucerswap",
        label=LABEL,
        system_prompt=SYSTEM_PROMPT.format(owner_address=owner_address),
        tools=tools,
        action_artifact_types={"build_saucerswap_swap_tx": "action/hedera-evm-tx-batch"},
    )

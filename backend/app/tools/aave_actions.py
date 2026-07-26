"""Aave v3 Sepolia yield actions — idle-balance detection and deposit calldata.

Two tools for the yield_advisor specialist:

- `check_idle_aave_reserves`: read-only, deterministic. For each known
  Sepolia reserve, calls `balanceOf` (via a public Sepolia RPC eth_call) on
  both the underlying token and its Aave aToken for the given wallet, so the
  agent can see which assets the wallet holds but hasn't supplied. No LLM
  involved in the numbers.
- `propose_yield_action`: deterministic calldata builder for ERC20
  `approve` + Aave v3 Pool `supply`. Only accepts the four known reserve
  symbols below — the agent picks *which* asset/amount, but never generates
  calldata itself, so a hallucinated address/amount can't reach the wallet.

Addresses are Aave's official Sepolia market
(https://github.com/bgd-labs/aave-address-book, AaveV3Sepolia.sol).
"""

import json
from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings
from app.tools._evm_encoding import _encode_address, _encode_uint

CHAIN_ID = 11155111  # Sepolia
POOL_ADDRESS = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"

RESERVES: dict[str, dict[str, Any]] = {
    "USDC": {
        "underlying": "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
        "a_token": "0x16dA4541aD1807f4443d92D26044C1147406EB80",
        "decimals": 6,
    },
    "DAI": {
        "underlying": "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
        "a_token": "0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8",
        "decimals": 18,
    },
    "LINK": {
        "underlying": "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5",
        "a_token": "0x3FfAf50D4F4E96eB78f2407c090b72e86eCaed24",
        "decimals": 18,
    },
    "WETH": {
        "underlying": "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
        "a_token": "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830",
        "decimals": 18,
    },
}

# Tokens that may appear in the wallet but are NOT supported by Aave v3 Sepolia.
# We check their balances so the agent can inform the user why they can't be supplied.
NON_AAVE_TOKENS: dict[str, dict[str, Any]] = {
    "USDC (Circle)": {
        "underlying": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "decimals": 6,
        "note": "Circle USDC — not listed in the Aave v3 Sepolia market. "
        "Use the Aave faucet to mint Aave testnet USDC instead.",
    },
}

BALANCE_OF_SELECTOR = "70a08231"
APPROVE_SELECTOR = "095ea7b3"
SUPPLY_SELECTOR = "617ba037"


async def _eth_call(to: str, data: str) -> int:
    settings = get_settings()
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(settings.sepolia_rpc_url, json=payload)
        resp.raise_for_status()
        result = resp.json()
    if "error" in result:
        raise RuntimeError(f"eth_call failed: {result['error']}")
    return int(result["result"], 16)


@tool
async def check_aave_positions(wallet_address: str) -> str:
    """Check what a wallet has already supplied into Aave v3 Sepolia.

    Reads (via live Sepolia RPC) the aToken balance for each supported
    reserve (USDC, DAI, LINK, WETH). An aToken balance > 0 means that
    asset is already earning yield in Aave. Returns zero for reserves
    not yet supplied.

    NOTE: This tool only reports Aave positions (aTokens). To find out what
    the wallet *holds* in the first place, use get_wallet_balances — that
    is the single source of truth for wallet balances, shared with the
    portfolio agent."""
    try:
        call_data = "0x" + BALANCE_OF_SELECTOR + _encode_address(wallet_address)
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    results = {}
    for symbol, reserve in RESERVES.items():
        try:
            a_token_raw = await _eth_call(reserve["a_token"], call_data)
        except Exception as exc:  # noqa: BLE001
            results[symbol] = {"error": str(exc)}
            continue
        decimals = reserve["decimals"]
        results[symbol] = {
            "supplied_to_aave": a_token_raw / 10**decimals,
            "aave_compatible": True,
        }

    return json.dumps(
        {
            "chain": "Sepolia",
            "wallet_address": wallet_address,
            "aave_positions": results,
        }
    )


@tool
def propose_yield_action(
    asset_symbol: str, amount: float, wallet_address: str, apy_pct: float, rationale: str
) -> str:
    """Build a real Aave v3 Sepolia deposit action for the given idle asset.

    `asset_symbol` must be one of USDC, DAI, LINK, WETH (only these have
    known, verified Sepolia addresses).

    NOTE: On Sepolia, Aave v3 supports Aave Testnet USDC (0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8),
    NOT Circle USDC (0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238). If the wallet holds
    Circle USDC, do NOT call this tool — recommend Uniswap v3 instead.

    `amount` is in human units (e.g. 0.5 for 0.5 WETH). `apy_pct` is the current
    supply APY you found via the Aave Sepolia subgraph — do not guess it.
    Returns a JSON action payload with the exact approve() + supply()
    transaction calldata for the wallet to sign; no funds move until the user
    approves each step in their own wallet."""
    symbol = asset_symbol.upper()
    if symbol not in RESERVES:
        return json.dumps(
            {"error": f"Unsupported asset '{asset_symbol}'. Supported: {', '.join(RESERVES)}"}
        )

    reserve = RESERVES[symbol]
    amount_wei = int(round(amount * 10 ** reserve["decimals"]))

    try:
        approve_calldata = (
            "0x" + APPROVE_SELECTOR + _encode_address(POOL_ADDRESS) + _encode_uint(amount_wei)
        )
        supply_calldata = (
            "0x"
            + SUPPLY_SELECTOR
            + _encode_address(reserve["underlying"])
            + _encode_uint(amount_wei)
            + _encode_address(wallet_address)
            + _encode_uint(0)  # referral code
        )
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    return json.dumps(
        {
            "protocol": "Aave v3",
            "network": "Sepolia",
            "chain_id": CHAIN_ID,
            "asset_symbol": symbol,
            "amount": amount,
            "apy_pct": apy_pct,
            "rationale": rationale,
            "steps": [
                {
                    "label": f"Approve {amount} {symbol} for Aave v3 Pool",
                    "to": reserve["underlying"],
                    "data": approve_calldata,
                    "value": "0x0",
                },
                {
                    "label": f"Supply {amount} {symbol} to Aave v3",
                    "to": POOL_ADDRESS,
                    "data": supply_calldata,
                    "value": "0x0",
                },
            ],
        }
    )


AAVE_ACTION_TOOLS = [check_aave_positions, propose_yield_action]

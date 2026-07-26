"""SaucerSwap (Hedera's leading DEX, https://www.saucerswap.finance) tools.

Two tools for the saucerswap specialist:

- `get_saucerswap_pool_aprs`: read-only. Combines SaucerSwap's public REST API
  (`/farms`, `/pools`, `/tokens`) to compute an approximate annualized farming
  APR per pool from SAUCE/HBAR emission rates and USD-priced TVL staked. This
  is live SaucerSwap mainnet data — SaucerSwap does not run pools on testnet,
  so this is informational only (see docs.saucerswap.finance/v/developer).
- `build_saucerswap_swap_tx`: deterministic calldata builder for ERC20
  `approve` + SwapRouter V2 `exactInput` (single-hop path) on Hedera testnet,
  mirroring the ExactInputParams struct SaucerSwap's V2 router (a Uniswap v3
  fork) exposes. Only the caller-supplied token ids/amounts flow into the
  path — the agent picks which pair/amount, never generates raw calldata
  itself.

Contract IDs are SaucerSwap's official testnet deployment
(https://docs.saucerswap.finance/developerx/contract-deployments).
"""

import json
import time
from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings
from app.tools._evm_encoding import _encode_address, _encode_bytes_payload, _encode_uint
from app.tools.hedera_evm_actions import resolve_evm_address

SAUCERSWAP_API_BASE_URL = "https://api.saucerswap.finance"

CHAIN_ID = 296  # Hedera testnet
# SaucerSwap V2 SwapRouter, testnet (Hedera contract ID 0.0.1414040).
ROUTER_HEDERA_ID = "0.0.1414040"
ROUTER_EVM_ADDRESS = f"0x{1414040:040x}"
DEFAULT_FEE_BPS = 1500  # 0.30% — SaucerSwap V2's most common pool tier

APPROVE_SELECTOR = "095ea7b3"
EXACT_INPUT_SELECTOR = "c04b8d59"  # exactInput((bytes,address,uint256,uint256,uint256))


async def _saucerswap_get(path: str, params: dict[str, Any] | None = None) -> Any:
    settings = get_settings()
    headers = {"x-api-key": settings.saucerswap_api_key} if settings.saucerswap_api_key else {}
    async with httpx.AsyncClient(base_url=SAUCERSWAP_API_BASE_URL, timeout=15) as client:
        resp = await client.get(path, params=params or {}, headers=headers)
        resp.raise_for_status()
        return resp.json()


@tool
async def get_saucerswap_pool_aprs(top_n: int = 5) -> str:
    """Find the best current farming APRs across SaucerSwap (Hedera's DEX) liquidity pools.

    Fetches active farms (SAUCE/HBAR emission rates), pool reserves/LP token
    prices, and token USD prices from SaucerSwap's public REST API, then
    computes an approximate annualized APR per farm as
    (daily emissions in USD * 365) / (USD value staked) * 100.

    `top_n` caps how many farms to return, sorted by APR descending. This is
    live SaucerSwap mainnet data (SaucerSwap has no pools on testnet)."""
    try:
        farms, pools, tokens = (
            await _saucerswap_get("/farms"),
            await _saucerswap_get("/pools"),
            await _saucerswap_get("/tokens"),
        )
    except Exception as exc:  # noqa: BLE001 - surface as an error payload, not a crash
        return json.dumps({"error": f"Failed to fetch SaucerSwap data: {exc}"})

    if not isinstance(farms, list) or not isinstance(pools, list):
        return json.dumps({"error": "Unexpected SaucerSwap API response shape."})

    price_by_symbol: dict[str, float] = {}
    if isinstance(tokens, list):
        for t in tokens:
            if isinstance(t, dict) and t.get("symbol") and t.get("priceUsd") is not None:
                try:
                    price_by_symbol[t["symbol"].upper()] = float(t["priceUsd"])
                except (TypeError, ValueError):
                    continue

    sauce_price = price_by_symbol.get("SAUCE", 0.0)
    hbar_price = price_by_symbol.get("HBAR") or price_by_symbol.get("WHBAR", 0.0)
    pools_by_id = {p.get("id"): p for p in pools if isinstance(p, dict)}

    results = []
    for farm in farms:
        if not isinstance(farm, dict):
            continue
        pool = pools_by_id.get(farm.get("poolId"))
        if not pool:
            continue
        try:
            lp_token = pool.get("lpToken") or {}
            lp_price = float(lp_token.get("priceUsd") or 0)
            lp_decimals = int(lp_token.get("decimals", 8))
            staked_units = int(farm.get("staked", 0)) / (10**lp_decimals)
            staked_usd = staked_units * lp_price
            if staked_usd <= 0:
                continue
            sauce_emissions = float(farm.get("sauceEmissions", 0) or 0)
            hbar_emissions = float(farm.get("hbarEmissions", 0) or 0)
            daily_emissions_usd = (
                sauce_emissions * sauce_price + hbar_emissions * hbar_price
            ) * 86400
            apr_pct = daily_emissions_usd * 365 / staked_usd * 100
        except (TypeError, ValueError, ZeroDivisionError):
            continue

        token_a = (pool.get("tokenA") or {}).get("symbol", "?")
        token_b = (pool.get("tokenB") or {}).get("symbol", "?")
        results.append(
            {
                "farm_id": farm.get("id"),
                "pool_id": farm.get("poolId"),
                "pair": f"{token_a}/{token_b}",
                "apr_pct": round(apr_pct, 2),
                "tvl_staked_usd": round(staked_usd, 2),
            }
        )

    results.sort(key=lambda r: r["apr_pct"], reverse=True)
    return json.dumps({"source": "SaucerSwap REST API (mainnet)", "farms": results[:top_n]})


@tool
async def build_saucerswap_swap_tx(
    token_in_id: str,
    token_in_decimals: int,
    token_out_id: str,
    token_out_decimals: int,
    amount_in: float,
    recipient_evm_address: str,
    fee_bps: int = DEFAULT_FEE_BPS,
    min_amount_out: float = 0,
) -> str:
    """Build a SaucerSwap V2 token-for-token swap on Hedera testnet.

    Calls SwapRouter V2's `exactInput` (single-hop path) via ERC20
    `approve` + `exactInput` calldata. `token_in_id`/`token_out_id` are
    Hedera token IDs ("0.0.x") or EVM addresses ("0x..."); pass the testnet
    WHBAR token ("0.0.15058") as one side to swap in/out of wrapped HBAR
    (SaucerSwap routes native HBAR through WHBAR — wrap/unwrap separately,
    this tool only builds the ERC20 leg). `amount_in`/`min_amount_out` are in
    human units of their respective tokens (pass each token's real decimals
    so the smallest-unit conversion is correct). `fee_bps` is the pool's fee
    tier in basis points — check get_saucerswap_pool_aprs or ask the user if
    unsure; SaucerSwap V2's most common tiers are 500 (0.05%), 1500 (0.30%),
    and 10000 (1.00%). `min_amount_out` defaults to 0 (no slippage
    protection) for demo purposes.

    Returns a JSON action payload with two sequential steps (ERC20 approve,
    then swap) for the connected wallet to sign; nothing executes until the
    user approves each step."""
    token_in = await resolve_evm_address(token_in_id)
    token_out = await resolve_evm_address(token_out_id)
    recipient = await resolve_evm_address(recipient_evm_address)

    amount_in_wei = int(round(amount_in * 10**token_in_decimals))
    amount_out_min_wei = int(round(min_amount_out * 10**token_out_decimals))
    deadline = int(time.time()) + 600

    try:
        path_bytes = (
            bytes.fromhex(_encode_address(token_in)[-40:])
            + fee_bps.to_bytes(3, "big")
            + bytes.fromhex(_encode_address(token_out)[-40:])
        )

        approve_calldata = (
            "0x"
            + APPROVE_SELECTOR
            + _encode_address(ROUTER_EVM_ADDRESS)
            + _encode_uint(amount_in_wei)
        )

        tuple_offset = _encode_uint(0x20)
        path_offset_in_tuple = _encode_uint(5 * 32)
        swap_calldata = (
            "0x"
            + EXACT_INPUT_SELECTOR
            + tuple_offset
            + path_offset_in_tuple
            + _encode_address(recipient)
            + _encode_uint(deadline)
            + _encode_uint(amount_in_wei)
            + _encode_uint(amount_out_min_wei)
            + _encode_bytes_payload(path_bytes)
        )
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    return json.dumps(
        {
            "protocol": "SaucerSwap V2",
            "network": "Hedera Testnet",
            "chain_id": CHAIN_ID,
            "human_message": f"Swap {amount_in} of {token_in_id} for {token_out_id} via SaucerSwap V2",
            "steps": [
                {
                    "label": f"Approve {amount_in} {token_in_id} for SaucerSwap V2 Router",
                    "to": token_in,
                    "data": approve_calldata,
                    "value": "0x0",
                },
                {
                    "label": f"Swap {amount_in} {token_in_id} -> {token_out_id}",
                    "to": ROUTER_EVM_ADDRESS,
                    "data": swap_calldata,
                    "value": "0x0",
                },
            ],
        }
    )


SAUCERSWAP_TOOLS = [get_saucerswap_pool_aprs, build_saucerswap_swap_tx]

"""Uniswap v3 LP yield tools for the yield_advisor specialist.

Two tools:

- `get_uniswap_v3_pool_aprs`: read-only. Queries the Uniswap v3 subgraph on
  The Graph for pools containing a given token, returning fee APR estimates
  per fee tier. The agent uses this to compare Aave supply APY vs Uniswap
  LP yield before making a recommendation.

- `build_uniswap_lp_tx`: deterministic calldata builder. Constructs the
  ERC-20 approve (×2) + NonfungiblePositionManager.mint() calldata for
  adding liquidity to a Uniswap v3 pool. The LLM picks the pool/amounts;
  this tool generates the exact bytes — nothing is hand-rolled by the model.

Supported chains and NonfungiblePositionManager addresses:
  Ethereum mainnet (1):  0xC36442b4a4522E871399CD717aBDD847Ab11FE88
  Base (8453):           0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f4
  Sepolia (11155111):    0x1238536071E1c677A632429e3655c799b22cDA52
"""

import json
from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings
from app.tools._evm_encoding import _encode_address, _encode_int, _encode_uint, network_name

# NonfungiblePositionManager per chain
NPM_ADDRESSES: dict[int, str] = {
    1: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f4",
    11155111: "0x1238536071E1c677A632429e3655c799b22cDA52",
}

# Uniswap v3 subgraph IDs on The Graph (decentralised network)
# Fallback: the agent will also try search_subgraphs_by_keyword if these miss.
UNISWAP_V3_SUBGRAPH_IDS: dict[int, str] = {
    1: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
    8453: "43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG",
    # Sepolia has limited subgraph coverage; agent falls back to subgraph search
}

APPROVE_SELECTOR = "095ea7b3"
# NonfungiblePositionManager.mint(MintParams) selector
MINT_SELECTOR = "88316456"

SECONDS_PER_YEAR = 365 * 24 * 3600


async def _query_subgraph(subgraph_id: str, query: str) -> dict[str, Any]:
    """Execute a GraphQL query against The Graph's decentralised network."""
    settings = get_settings()
    url = f"https://gateway.thegraph.com/api/{settings.graph_api_key}/subgraphs/id/{subgraph_id}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={"query": query})
        resp.raise_for_status()
        return resp.json()


@tool
async def get_uniswap_v3_pool_aprs(
    token_address: str,
    chain_id: int = 1,
    top_n: int = 5,
) -> str:
    """Query Uniswap v3 subgraph for pools containing a token and estimate fee APR.

    Looks up the top pools (by TVL) that include `token_address` on the given
    chain. For each pool, computes a 24-hour fee APR from feesUSD / tvlUSD.
    Returns JSON with pool address, token pair, fee tier, TVL, and estimated
    annualised fee APR. The agent uses this to compare Uniswap LP yield
    against Aave supply APY before recommending an action.

    `chain_id`: 1 = Ethereum mainnet, 8453 = Base, 11155111 = Sepolia.
    `top_n`: maximum number of pools to return (default 5).
    """
    subgraph_id = UNISWAP_V3_SUBGRAPH_IDS.get(chain_id)
    if not subgraph_id:
        return json.dumps(
            {
                "error": f"No Uniswap v3 subgraph configured for chain_id {chain_id}. "
                "Try The Graph MCP search_subgraphs_by_keyword('uniswap v3') to find one."
            }
        )

    addr = token_address.lower()
    query = f"""{{
  pools(
    first: {top_n}
    orderBy: totalValueLockedUSD
    orderDirection: desc
    where: {{
      or: [
        {{ token0: "{addr}" }}
        {{ token1: "{addr}" }}
      ]
      totalValueLockedUSD_gt: "10000"
    }}
  ) {{
    id
    feeTier
    token0 {{ id symbol decimals }}
    token1 {{ id symbol decimals }}
    totalValueLockedUSD
    feesUSD
    poolDayData(first: 1 orderBy: date orderDirection: desc) {{
      feesUSD
      tvlUSD
    }}
  }}
}}"""

    try:
        data = await _query_subgraph(subgraph_id, query)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"Subgraph query failed: {exc}"})

    pools_raw: list[dict] = (data.get("data") or {}).get("pools") or []
    results = []
    for p in pools_raw:
        day = (p.get("poolDayData") or [{}])[0]
        fees_24h = float(day.get("feesUSD") or 0)
        tvl = float(day.get("tvlUSD") or p.get("totalValueLockedUSD") or 0)
        apr_pct = round((fees_24h * 365 / tvl * 100), 2) if tvl > 0 else None
        results.append(
            {
                "pool_address": p["id"],
                "token0": p["token0"]["symbol"],
                "token1": p["token1"]["symbol"],
                "fee_tier_bps": int(p["feeTier"]) // 100,  # e.g. 3000 → 30 bps = 0.3%
                "fee_tier_pct": int(p["feeTier"]) / 1_000_000,
                "tvl_usd": round(tvl, 2),
                "fees_24h_usd": round(fees_24h, 2),
                "estimated_fee_apr_pct": apr_pct,
                "note": "Fee APR only — does not include impermanent loss risk.",
            }
        )

    return json.dumps(
        {
            "chain_id": chain_id,
            "network": network_name(chain_id),
            "token_queried": token_address,
            "pools": results,
            "warning": (
                "Uniswap v3 LP exposes you to impermanent loss (IL). "
                "Compare fee APR against Aave supply APY — Aave has no IL risk."
            ),
        }
    )


@tool
def build_uniswap_lp_tx(
    pool_address: str,
    token0_address: str,
    token1_address: str,
    amount0_desired: float,
    amount1_desired: float,
    decimals0: int,
    decimals1: int,
    fee_tier: int,
    tick_lower: int,
    tick_upper: int,
    wallet_address: str,
    deadline_seconds: int = 1200,
    chain_id: int = 1,
) -> str:
    """Build unsigned Uniswap v3 addLiquidity (mint) transactions for the user's wallet.

    Constructs:
      1. approve(NPM, amount0) on token0
      2. approve(NPM, amount1) on token1
      3. NonfungiblePositionManager.mint(MintParams) — creates the LP position

    `fee_tier` is in Uniswap units: 500, 3000, or 10000 (0.05%, 0.3%, 1%).
    `tick_lower` / `tick_upper` define the price range for the position.
    `amount0_desired` / `amount1_desired` are in human units (e.g. 100.0 USDC);
    `decimals0` / `decimals1` are token0/token1's real on-chain decimals
    (e.g. 6 for USDC, 18 for WETH) — pass the actual value, since scaling by
    the wrong decimals produces a wildly wrong on-chain amount.
    `deadline_seconds` is added to block.timestamp on-chain (default 20 min).

    Returns a JSON action payload with 3 transaction steps for the wallet to
    sign — no funds move until the user approves each step.
    """
    npm = NPM_ADDRESSES.get(chain_id)
    if not npm:
        return json.dumps(
            {
                "error": f"NonfungiblePositionManager address unknown for chain_id {chain_id}. "
                "Supported: 1 (mainnet), 8453 (Base), 11155111 (Sepolia)."
            }
        )

    # We encode MintParams as ABI-encoded calldata for mint(MintParams):
    # struct MintParams {
    #   address token0; address token1; uint24 fee;
    #   int24 tickLower; int24 tickUpper;
    #   uint256 amount0Desired; uint256 amount1Desired;
    #   uint256 amount0Min; uint256 amount1Min;
    #   address recipient; uint256 deadline;
    # }
    # For testnet demo: amount0Min = amount1Min = 0 (max slippage accepted).
    import time

    deadline = int(time.time()) + deadline_seconds

    raw0 = int(round(amount0_desired * 10**decimals0))
    raw1 = int(round(amount1_desired * 10**decimals1))

    try:
        mint_calldata = (
            "0x"
            + MINT_SELECTOR
            # offset to MintParams struct (always 0x20 for single-param calls)
            + _encode_uint(32)
            + _encode_address(token0_address)
            + _encode_address(token1_address)
            + _encode_uint(fee_tier)
            + _encode_int(tick_lower)
            + _encode_int(tick_upper)
            + _encode_uint(raw0)  # amount0Desired
            + _encode_uint(raw1)  # amount1Desired
            + _encode_uint(0)  # amount0Min (0 = max slippage for demo)
            + _encode_uint(0)  # amount1Min
            + _encode_address(wallet_address)  # recipient
            + _encode_uint(deadline)
        )

        approve0_calldata = "0x" + APPROVE_SELECTOR + _encode_address(npm) + _encode_uint(raw0)
        approve1_calldata = "0x" + APPROVE_SELECTOR + _encode_address(npm) + _encode_uint(raw1)
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    fee_pct = fee_tier / 10_000

    return json.dumps(
        {
            "protocol": "Uniswap v3",
            "network": network_name(chain_id),
            "chain_id": chain_id,
            "pool_address": pool_address,
            "token0": token0_address,
            "token1": token1_address,
            "fee_tier_pct": fee_pct,
            "amount0_desired": amount0_desired,
            "amount1_desired": amount1_desired,
            "tick_lower": tick_lower,
            "tick_upper": tick_upper,
            "warning": (
                "This LP position is subject to impermanent loss. "
                "amount0Min/amount1Min are 0 (testnet demo) — use tighter slippage in production."
            ),
            "steps": [
                {
                    "label": f"Approve {amount0_desired} token0 ({token0_address[:10]}…) for Uniswap v3 NPM",
                    "to": token0_address,
                    "data": approve0_calldata,
                    "value": "0x0",
                },
                {
                    "label": f"Approve {amount1_desired} token1 ({token1_address[:10]}…) for Uniswap v3 NPM",
                    "to": token1_address,
                    "data": approve1_calldata,
                    "value": "0x0",
                },
                {
                    "label": f"Add liquidity to Uniswap v3 {fee_pct:.2f}% pool",
                    "to": npm,
                    "data": mint_calldata,
                    "value": "0x0",
                },
            ],
        }
    )


UNISWAP_LP_TOOLS = [get_uniswap_v3_pool_aprs, build_uniswap_lp_tx]

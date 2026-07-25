"""Tests for uniswap_lp_actions tools."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.uniswap_lp_actions import (
    NPM_ADDRESSES,
    UNISWAP_V3_SUBGRAPH_IDS,
    build_uniswap_lp_tx,
    get_uniswap_v3_pool_aprs,
)


# ── get_uniswap_v3_pool_aprs ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_pool_aprs_unsupported_chain():
    result = json.loads(await get_uniswap_v3_pool_aprs.ainvoke({"token_address": "0xabc", "chain_id": 999}))
    assert "error" in result


@pytest.mark.asyncio
async def test_get_pool_aprs_subgraph_error():
    with patch("app.tools.uniswap_lp_actions._query_subgraph", new_callable=AsyncMock) as mock_q:
        mock_q.side_effect = Exception("timeout")
        result = json.loads(await get_uniswap_v3_pool_aprs.ainvoke({"token_address": "0xabc", "chain_id": 1}))
    assert "error" in result
    assert "timeout" in result["error"]


@pytest.mark.asyncio
async def test_get_pool_aprs_success():
    fake_pool = {
        "id": "0xpool1",
        "feeTier": "3000",
        "token0": {"id": "0xtoken0", "symbol": "USDC", "decimals": "6"},
        "token1": {"id": "0xtoken1", "symbol": "WETH", "decimals": "18"},
        "totalValueLockedUSD": "500000",
        "feesUSD": "1000",
        "poolDayData": [{"feesUSD": "500", "tvlUSD": "500000"}],
    }
    with patch("app.tools.uniswap_lp_actions._query_subgraph", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = {"data": {"pools": [fake_pool]}}
        result = json.loads(
            await get_uniswap_v3_pool_aprs.ainvoke({"token_address": "0xtoken0", "chain_id": 1})
        )

    assert result["chain_id"] == 1
    assert len(result["pools"]) == 1
    pool = result["pools"][0]
    assert pool["token0"] == "USDC"
    assert pool["token1"] == "WETH"
    assert pool["fee_tier_pct"] == pytest.approx(0.003)
    # fee APR = 500 * 365 / 500000 * 100 ≈ 36.5%
    assert pool["estimated_fee_apr_pct"] == pytest.approx(36.5, abs=0.1)
    assert "warning" in result  # IL warning present


@pytest.mark.asyncio
async def test_get_pool_aprs_empty_pools():
    with patch("app.tools.uniswap_lp_actions._query_subgraph", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = {"data": {"pools": []}}
        result = json.loads(
            await get_uniswap_v3_pool_aprs.ainvoke({"token_address": "0xrare", "chain_id": 1})
        )
    assert result["pools"] == []


# ── build_uniswap_lp_tx ───────────────────────────────────────────────────────


def test_build_lp_tx_unsupported_chain():
    result = json.loads(
        build_uniswap_lp_tx.invoke(
            {
                "pool_address": "0xpool",
                "token0_address": "0xtoken0",
                "token1_address": "0xtoken1",
                "amount0_desired": 100.0,
                "amount1_desired": 0.05,
                "fee_tier": 3000,
                "tick_lower": -887220,
                "tick_upper": 887220,
                "wallet_address": "0xwallet",
                "chain_id": 999,
            }
        )
    )
    assert "error" in result


def test_build_lp_tx_sepolia():
    result = json.loads(
        build_uniswap_lp_tx.invoke(
            {
                "pool_address": "0xpool",
                "token0_address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
                "token1_address": "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
                "amount0_desired": 100.0,
                "amount1_desired": 0.03,
                "fee_tier": 3000,
                "tick_lower": -887220,
                "tick_upper": 887220,
                "wallet_address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132",
                "chain_id": 11155111,
            }
        )
    )
    assert result["protocol"] == "Uniswap v3"
    assert result["network"] == "Sepolia"
    assert result["chain_id"] == 11155111
    assert len(result["steps"]) == 3

    approve0, approve1, mint = result["steps"]
    # approve steps target the token contracts
    assert approve0["to"] == "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
    assert approve1["to"] == "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c"
    # mint step targets the NPM
    assert mint["to"] == NPM_ADDRESSES[11155111]
    assert mint["data"].startswith("0x88316456")  # mint selector


def test_build_lp_tx_mainnet_uses_correct_npm():
    result = json.loads(
        build_uniswap_lp_tx.invoke(
            {
                "pool_address": "0xpool",
                "token0_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "token1_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "amount0_desired": 1000.0,
                "amount1_desired": 0.3,
                "fee_tier": 500,
                "tick_lower": -887272,
                "tick_upper": 887272,
                "wallet_address": "0xdeadbeef00000000000000000000000000000001",
                "chain_id": 1,
            }
        )
    )
    assert result["steps"][2]["to"] == NPM_ADDRESSES[1]
    assert result["fee_tier_pct"] == pytest.approx(0.05)
    assert "warning" in result  # IL warning present


def test_build_lp_tx_negative_tick_encoded():
    """Negative ticks (tick_lower) must be two's-complement encoded, not produce errors."""
    result = json.loads(
        build_uniswap_lp_tx.invoke(
            {
                "pool_address": "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
                "token0_address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                "token1_address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
                "amount0_desired": 50.0,
                "amount1_desired": 50.0,
                "fee_tier": 10000,
                "tick_lower": -887200,
                "tick_upper": 887200,
                "wallet_address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132",
                "chain_id": 8453,
            }
        )
    )
    assert "error" not in result
    mint_data = result["steps"][2]["data"]
    # calldata should be a valid hex string (only 0-9, a-f, and leading 0x)
    assert all(c in "0123456789abcdefx" for c in mint_data.lower())

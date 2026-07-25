import json

import pytest

from app.tools.saucerswap_actions import (
    ROUTER_EVM_ADDRESS,
    build_saucerswap_swap_tx,
    get_saucerswap_pool_aprs,
)


@pytest.mark.asyncio
async def test_build_saucerswap_swap_tx_shape():
    result = await build_saucerswap_swap_tx.ainvoke(
        {
            "token_in_id": "0x197a5285387a33ca7be0653636e9c65fbcf0ea22",
            "token_in_decimals": 6,
            "token_out_id": "0.0.15058",
            "token_out_decimals": 8,
            "amount_in": 10,
            "recipient_evm_address": "0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b",
        }
    )
    payload = json.loads(result)
    assert payload["protocol"] == "SaucerSwap V2"
    assert payload["chain_id"] == 296
    assert len(payload["steps"]) == 2

    approve_step, swap_step = payload["steps"]
    assert approve_step["to"] == "0x197a5285387a33ca7be0653636e9c65fbcf0ea22"
    assert approve_step["data"].startswith("0x095ea7b3")
    assert swap_step["to"] == ROUTER_EVM_ADDRESS
    assert swap_step["data"].startswith("0xc04b8d59")


@pytest.mark.asyncio
async def test_build_saucerswap_swap_tx_path_encoding():
    result = await build_saucerswap_swap_tx.ainvoke(
        {
            "token_in_id": "0x197a5285387a33ca7be0653636e9c65fbcf0ea22",
            "token_in_decimals": 6,
            "token_out_id": "0x0000000000000000000000000000000000003ad2",
            "token_out_decimals": 8,
            "amount_in": 1,
            "recipient_evm_address": "0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b",
            "fee_bps": 1500,
        }
    )
    payload = json.loads(result)
    swap_data = payload["steps"][1]["data"]
    body = swap_data[2 + 8 :]
    words = [body[i : i + 64] for i in range(0, len(body), 64)]

    assert int(words[0], 16) == 0x20  # tuple offset
    assert int(words[1], 16) == 5 * 32  # path offset within tuple
    assert words[2].endswith("8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b")  # recipient
    assert int(words[6], 16) == 43  # path length: 20 + 3 + 20 bytes

    path_hex = "".join(words[7:])[: 43 * 2]
    assert path_hex[:40] == "197a5285387a33ca7be0653636e9c65fbcf0ea22"
    assert path_hex[40:46] == "0005dc"  # fee 1500 as 3-byte big-endian hex
    assert path_hex[46:86] == "0000000000000000000000000000000000003ad2"


@pytest.mark.asyncio
async def test_get_saucerswap_pool_aprs_computes_apr(monkeypatch):
    async def fake_get(path, params=None):
        if path == "/farms":
            return [{"id": 1, "poolId": 10, "sauceEmissions": 1.0, "hbarEmissions": 0.0, "staked": "1000000000"}]
        if path == "/pools":
            return [
                {
                    "id": 10,
                    "tokenA": {"symbol": "SAUCE"},
                    "tokenB": {"symbol": "XSAUCE"},
                    "lpToken": {"priceUsd": "1.0", "decimals": 8},
                }
            ]
        if path == "/tokens":
            return [{"symbol": "SAUCE", "priceUsd": "0.02"}]
        raise AssertionError(f"unexpected path {path}")

    monkeypatch.setattr("app.tools.saucerswap_actions._saucerswap_get", fake_get)

    result = await get_saucerswap_pool_aprs.ainvoke({"top_n": 5})
    payload = json.loads(result)
    assert len(payload["farms"]) == 1
    farm = payload["farms"][0]
    assert farm["pair"] == "SAUCE/XSAUCE"
    assert farm["apr_pct"] > 0


@pytest.mark.asyncio
async def test_get_saucerswap_pool_aprs_handles_errors(monkeypatch):
    async def fake_get(path, params=None):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.tools.saucerswap_actions._saucerswap_get", fake_get)

    result = await get_saucerswap_pool_aprs.ainvoke({"top_n": 5})
    payload = json.loads(result)
    assert "error" in payload

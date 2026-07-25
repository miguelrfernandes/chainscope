from unittest.mock import AsyncMock, patch

import pytest

from app.tools.token_api import get_wallet_balances


@pytest.mark.asyncio
async def test_get_wallet_balances_polygon_slug():
    with patch("app.tools.token_api._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"status": "ok"}
        await get_wallet_balances.ainvoke({"address": "0x123", "network": "polygon"})
        mock_get.assert_called_once_with(
            "/v1/evm/balances", {"address": "0x123", "network": "polygon"}
        )


@pytest.mark.asyncio
async def test_get_wallet_balances_sepolia_rpc_fallback():
    with patch("app.tools.token_api._get_sepolia_rpc_balances", new_callable=AsyncMock) as mock_rpc:
        mock_rpc.return_value = {"network": "sepolia", "address": "0x123", "data": []}
        res = await get_wallet_balances.ainvoke({"address": "0x123", "network": "sepolia"})
        mock_rpc.assert_called_once_with("0x123")
        assert res["network"] == "sepolia"


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.skip(reason="Live integration test requiring PINAX_API_TOKEN")
async def test_get_wallet_balances_live_polygon():
    res = await get_wallet_balances.ainvoke(
        {"address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132", "network": "polygon"}
    )
    assert isinstance(res, dict)


def test_sepolia_tokens_usdc_address():
    from app.tools.token_api import SEPOLIA_TOKENS
    assert SEPOLIA_TOKENS["USDC"]["address"] == "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
    assert SEPOLIA_TOKENS["USDC"]["decimals"] == 6



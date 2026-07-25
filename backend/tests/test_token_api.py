import pytest
from unittest.mock import AsyncMock, patch
from app.tools.token_api import get_wallet_balances, get_wallet_transfers


@pytest.mark.asyncio
async def test_get_wallet_balances_polygon_slug():
    with patch("app.tools.token_api._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"status": "ok"}
        await get_wallet_balances.ainvoke({"address": "0x123", "network": "polygon"})
        mock_get.assert_called_once_with("/v1/evm/balances", {"address": "0x123", "network": "polygon"})


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.skip(reason="Live integration test requiring PINAX_API_TOKEN")
async def test_get_wallet_balances_live_polygon():
    res = await get_wallet_balances.ainvoke(
        {"address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132", "network": "polygon"}
    )
    assert isinstance(res, dict)

import pytest
from unittest.mock import AsyncMock, patch
from app.tools.hedera_mirror import (
    get_hedera_account,
    get_hedera_account_nfts,
    get_hedera_topic_messages,
    get_transaction_by_id,
    to_mirror_node_transaction_id,
)


def test_to_mirror_node_transaction_id_converts_sdk_format():
    assert (
        to_mirror_node_transaction_id("0.0.1001@1699999999.123456789")
        == "0.0.1001-1699999999-123456789"
    )


def test_to_mirror_node_transaction_id_passes_through_dashed_format():
    assert to_mirror_node_transaction_id("0.0.1001-1699999999-123456789") == "0.0.1001-1699999999-123456789"


@pytest.mark.asyncio
async def test_get_transaction_by_id_calls_expected_path():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"transactions": [{"result": "SUCCESS"}]}
        await get_transaction_by_id("0.0.1001@1699999999.123456789")
        mock_get.assert_called_once_with("/api/v1/transactions/0.0.1001-1699999999-123456789")


@pytest.mark.asyncio
async def test_get_hedera_account_calls_expected_path():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"account": "0.0.1234"}
        await get_hedera_account.ainvoke({"account_id": "0.0.1234"})
        mock_get.assert_called_once_with("/api/v1/accounts/0.0.1234")


@pytest.mark.asyncio
async def test_get_hedera_account_nfts_filters_by_token_id():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"nfts": []}
        await get_hedera_account_nfts.ainvoke({"account_id": "0.0.1234", "token_id": "0.0.5678"})
        mock_get.assert_called_once_with(
            "/api/v1/accounts/0.0.1234/nfts", {"limit": 25, "token.id": "0.0.5678"}
        )


@pytest.mark.asyncio
async def test_get_hedera_topic_messages_orders_desc():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"messages": []}
        await get_hedera_topic_messages.ainvoke({"topic_id": "0.0.9101"})
        mock_get.assert_called_once_with(
            "/api/v1/topics/0.0.9101/messages", {"limit": 10, "order": "desc"}
        )


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.skip(reason="Live integration test hitting the public Hedera testnet mirror node")
async def test_get_hedera_account_live_testnet():
    res = await get_hedera_account.ainvoke({"account_id": "0.0.2"})
    assert isinstance(res, dict)

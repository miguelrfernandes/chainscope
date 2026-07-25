from unittest.mock import AsyncMock, patch

import pytest

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
    assert (
        to_mirror_node_transaction_id("0.0.1001-1699999999-123456789")
        == "0.0.1001-1699999999-123456789"
    )


@pytest.mark.asyncio
async def test_get_transaction_by_id_calls_expected_path():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"transactions": [{"result": "SUCCESS"}]}
        await get_transaction_by_id("0.0.1001@1699999999.123456789")
        mock_get.assert_called_once_with("/api/v1/transactions/0.0.1001-1699999999-123456789")


@pytest.mark.asyncio
async def test_get_transaction_by_id_evm_hash():
    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = [
            {
                "timestamp": "1785002094.261263104",
                "result": "SUCCESS",
                "amount": 100_000_000,
                "contract_id": "0.0.87713",
            },
            {
                "transactions": [
                    {
                        "result": "SUCCESS",
                        "transfers": [],
                    }
                ]
            },
        ]
        tx_res = await get_transaction_by_id(
            "0xb368a557ff71bfa5025b498b39dc9ae05774a338ff03e73f1ee3138c60de0cf1"
        )
        assert len(tx_res["transactions"]) == 1
        tx = tx_res["transactions"][0]
        assert tx["result"] == "SUCCESS"
        assert any(
            t["account"] == "0.0.87713" and t["amount"] == 100_000_000 for t in tx["transfers"]
        )


@pytest.mark.asyncio
async def test_get_transaction_by_id_evm_hash_non_contract():
    import httpx

    with patch("app.tools.hedera_mirror._get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.HTTPStatusError("Not Found", request=None, response=None)
        tx_res = await get_transaction_by_id(
            "0xb5096553fb09ab11abb9819cac9b1721cee3dec5d58c1ed662cce7f356a0f0c5"
        )
        assert tx_res == {"transactions": []}
        assert mock_get.call_count == 3
        mock_get.assert_called_with(
            "/api/v1/contracts/results/0xb5096553fb09ab11abb9819cac9b1721cee3dec5d58c1ed662cce7f356a0f0c5"
        )


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

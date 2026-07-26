import json
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.uniswap_actions import build_uniswap_swap_tx, get_uniswap_quote


@pytest.mark.asyncio
async def test_get_uniswap_quote_success():
    mock_quote_response = {
        "quoteId": "quote-123",
        "amount": "1000000000000000000",
        "route": [["0xETH", "0xUSDC"]],
        "gasFee": "150000",
    }

    with patch("app.tools.uniswap_actions._uniswap_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_quote_response

        result_str = await get_uniswap_quote.ainvoke(
            {
                "token_in_address": "0x0000000000000000000000000000000000000000",
                "token_out_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "amount_in": "1000000000000000000",
                "chain_id": 1,
                "swapper_address": "0x1111111111111111111111111111111111111111",
            }
        )

        mock_post.assert_called_once()
        res = json.loads(result_str)
        assert res["quoteId"] == "quote-123"
        assert res["gasFee"] == "150000"


@pytest.mark.asyncio
async def test_build_uniswap_swap_tx_native_eth():
    mock_quote = {"quoteId": "q123"}
    mock_swap = {
        "swap": {
            "to": "0x3333333333333333333333333333333333333333",
            "data": "0x123456",
            "value": "0xde0b6b3a7640000",
        }
    }

    with patch("app.tools.uniswap_actions._uniswap_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [mock_quote, mock_swap]

        result_str = await build_uniswap_swap_tx.ainvoke(
            {
                "token_in_address": "0x0000000000000000000000000000000000000000",
                "token_out_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "amount_in": "1000000000000000000",
                "chain_id": 1,
                "swapper_address": "0x1111111111111111111111111111111111111111",
            }
        )

        res = json.loads(result_str)
        assert res["protocol"] == "Uniswap Trading API"
        assert res["chain_id"] == 1
        assert len(res["steps"]) == 1  # Native ETH needs no approve step
        assert res["steps"][0]["to"] == "0x3333333333333333333333333333333333333333"
        assert res["steps"][0]["data"] == "0x123456"
        assert res["steps"][0]["value"] == "0xde0b6b3a7640000"


@pytest.mark.asyncio
async def test_build_uniswap_swap_tx_erc20_prepends_approve():
    mock_quote = {"quoteId": "q456"}
    mock_swap = {
        "swap": {
            "to": "0x3333333333333333333333333333333333333333",
            "data": "0x789abc",
            "value": "0x0",
        }
    }

    token_in = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

    with patch("app.tools.uniswap_actions._uniswap_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [mock_quote, mock_swap]

        result_str = await build_uniswap_swap_tx.ainvoke(
            {
                "token_in_address": token_in,
                "token_out_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "amount_in": "1000000",
                "chain_id": 8453,
                "swapper_address": "0x1111111111111111111111111111111111111111",
            }
        )

        res = json.loads(result_str)
        assert res["protocol"] == "Uniswap Trading API"
        assert res["network"] == "Base"
        assert res["chain_id"] == 8453
        assert len(res["steps"]) == 2  # Approve step prepended
        assert res["steps"][0]["to"] == token_in
        assert res["steps"][0]["data"].startswith("0x095ea7b3")
        assert res["steps"][1]["to"] == "0x3333333333333333333333333333333333333333"
        assert res["steps"][1]["data"] == "0x789abc"


@pytest.mark.asyncio
async def test_build_uniswap_swap_tx_approve_amount_not_precision_lossy_for_large_wei():
    """amount_in is raw wei (e.g. 1 ETH = 1e18); int(float(...)) used to lose
    precision above 2**53 and approve the wrong amount for realistic sizes."""
    mock_quote = {"quoteId": "q789"}
    mock_swap = {
        "swap": {
            "to": "0x3333333333333333333333333333333333333333",
            "data": "0xabcdef",
            "value": "0x0",
        }
    }
    token_in = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    amount_in = "123456789012345678"  # > 2**53, not exactly representable as float

    with patch("app.tools.uniswap_actions._uniswap_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [mock_quote, mock_swap]

        result_str = await build_uniswap_swap_tx.ainvoke(
            {
                "token_in_address": token_in,
                "token_out_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "amount_in": amount_in,
                "chain_id": 1,
                "swapper_address": "0x1111111111111111111111111111111111111111",
            }
        )

        res = json.loads(result_str)
        approve_amount_hex = res["steps"][0]["data"][-64:]
        assert int(approve_amount_hex, 16) == int(amount_in)


@pytest.mark.asyncio
async def test_build_uniswap_swap_tx_rejects_malformed_swap_target():
    """A malformed 'to' address from the Trading API response must not
    silently corrupt the approve calldata sent to the wallet."""
    mock_quote = {"quoteId": "q000"}
    mock_swap = {"swap": {"to": "not-an-address", "data": "0xabc", "value": "0x0"}}
    token_in = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

    with patch("app.tools.uniswap_actions._uniswap_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [mock_quote, mock_swap]

        result_str = await build_uniswap_swap_tx.ainvoke(
            {
                "token_in_address": token_in,
                "token_out_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "amount_in": "1000000",
                "chain_id": 1,
                "swapper_address": "0x1111111111111111111111111111111111111111",
            }
        )
        res = json.loads(result_str)
        assert "error" in res

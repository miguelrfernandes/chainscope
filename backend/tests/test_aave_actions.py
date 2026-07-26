import json

from app.tools.aave_actions import propose_yield_action


def test_propose_yield_action_rejects_malformed_wallet_address():
    """A malformed wallet address must not silently corrupt approve/supply
    calldata sent to the wallet."""
    result = json.loads(
        propose_yield_action.invoke(
            {
                "asset_symbol": "USDC",
                "amount": 10.0,
                "wallet_address": "not-an-address",
                "apy_pct": 3.5,
                "rationale": "idle USDC",
            }
        )
    )
    assert "error" in result


def test_propose_yield_action_scales_by_reserve_decimals():
    result = json.loads(
        propose_yield_action.invoke(
            {
                "asset_symbol": "USDC",
                "amount": 10.0,
                "wallet_address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132",
                "apy_pct": 3.5,
                "rationale": "idle USDC",
            }
        )
    )
    assert "error" not in result
    approve_amount_hex = result["steps"][0]["data"][-64:]
    assert int(approve_amount_hex, 16) == 10 * 10**6  # USDC has 6 decimals

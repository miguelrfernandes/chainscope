import json

import pytest

from app.agents.specialists.hedera_wallet_action import (
    NO_EVM_WALLET_MESSAGE,
    hedera_wallet_action_node,
)
from app.tools.hedera_evm_actions import build_hbar_transfer_evm_tx, resolve_evm_address
from app.tools.hedera_schedule_actions import (
    CONFIGURE_SELECTOR,
    CREATE_VAULT_SELECTOR,
    DEPOSIT_SELECTOR,
    GET_LATEST_USER_VAULT_SELECTOR,
    SCHEDULE_NEXT_RUN_SELECTOR,
    build_recurring_hbar_transfer_actions,
    encode_configure,
    predict_contract_address,
)


@pytest.mark.asyncio
async def test_resolve_evm_address_passthrough():
    addr = "0x53b87eAC00000000000000000000000000000000"
    resolved = await resolve_evm_address(addr)
    assert resolved == addr.lower()


@pytest.mark.asyncio
async def test_resolve_evm_address_native_fallback():
    # 0.0.1234 -> hex 0x000...04d2 (1234 in hex is 4d2)
    resolved = await resolve_evm_address("0.0.1234")
    assert resolved.startswith("0x")
    assert resolved.endswith("4d2")
    assert len(resolved) == 42


@pytest.mark.asyncio
async def test_build_hbar_transfer_evm_tx():
    res_json = await build_hbar_transfer_evm_tx.ainvoke(
        {"to_evm_address": "0x53b87eAC00000000000000000000000000000000", "amount_hbar": 1.5}
    )
    payload = json.loads(res_json)
    assert payload["to"] == "0x53b87eac00000000000000000000000000000000"
    # 1.5 HBAR = 1.5e18 wei = 1500000000000000000 = 0x14d1120d7b160000
    assert payload["value"] == "0x14d1120d7b160000"
    assert payload["data"] == "0x"
    assert "Transfer 1.5 HBAR" in payload["human_message"]


def test_schedule_selectors():
    assert CREATE_VAULT_SELECTOR == "b4bd6f46"
    assert GET_LATEST_USER_VAULT_SELECTOR == "70111f88"
    assert CONFIGURE_SELECTOR == "ba674903"
    assert DEPOSIT_SELECTOR == "d0e30db0"
    assert SCHEDULE_NEXT_RUN_SELECTOR == "38b295fd"


def test_encode_configure():
    config = bytes.fromhex("00" * 32 + "00" * 32)
    encoded = encode_configure(config, 3600)
    # Head: 64 bytes offset (0x40) + 3600 (0xe10)
    assert encoded.startswith("0000000000000000000000000000000000000000000000000000000000000040")
    assert "0000000000000000000000000000000000000000000000000000000000000e10" in encoded


def test_predict_contract_address():
    addr = predict_contract_address("0x1234567890123456789012345678901234567890", 0)
    assert addr.startswith("0x")
    assert len(addr) == 42


@pytest.mark.asyncio
async def test_build_recurring_hbar_transfer_actions():
    res_json = await build_recurring_hbar_transfer_actions.ainvoke(
        {
            "user_evm_address": "0x1111111111111111111111111111111111111111",
            "recipient_evm_address": "0x2222222222222222222222222222222222222222",
            "amount_hbar": 2.0,
            "interval_seconds": 3600,
        }
    )
    payload = json.loads(res_json)
    assert "Schedule recurring transfer" in payload["human_message"]
    steps = payload["steps"]
    assert len(steps) >= 3
    # Check deposit step value: 2.0 HBAR = 2e18 wei = 0x1bc16d674ec80000
    deposit_step = [s for s in steps if "Deposit" in s["label"]][0]
    assert deposit_step["value"] == "0x1bc16d674ec80000"


@pytest.mark.asyncio
async def test_hedera_wallet_action_node_recurring_no_evm_wallet():
    state = {
        "question": "send 1 HBAR every hour (Connected Hedera wallet: 0.0.123456)",
        "messages": [],
    }
    res = await hedera_wallet_action_node(state)
    assert res["specialist_results"]["hedera_wallet_action"] == NO_EVM_WALLET_MESSAGE

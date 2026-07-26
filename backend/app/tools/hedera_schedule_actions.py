"""Hedera Schedule Service (HSS) action tools — recurring HBAR transfers via EVM precompiles.

Builds multi-step eth_sendTransaction payloads for EVM wallets (e.g. MetaMask)
connected to Hedera testnet (chain ID 296).
"""

import json

import httpx
import rlp
from eth_utils import keccak
from langchain_core.tools import tool

from app.core.config import get_settings
from app.tools._evm_encoding import _encode_address, _encode_bytes_payload, _encode_uint
from app.tools.hedera_evm_actions import resolve_evm_address

CREATE_VAULT_SELECTOR = "b4bd6f46"
GET_LATEST_USER_VAULT_SELECTOR = "70111f88"
CONFIGURE_SELECTOR = "ba674903"
DEPOSIT_SELECTOR = "d0e30db0"
SCHEDULE_NEXT_RUN_SELECTOR = "38b295fd"


def encode_configure(config: bytes, interval: int) -> str:
    offset = 64
    head = _encode_uint(offset) + _encode_uint(interval)
    tail = _encode_bytes_payload(config)
    return head + tail


def predict_contract_address(sender: str, nonce: int) -> str:
    sender_bytes = bytes.fromhex(sender.lower().removeprefix("0x"))
    encoded = rlp.encode([sender_bytes, nonce])
    return "0x" + keccak(encoded)[-20:].hex()


async def _eth_call(to: str, data: str) -> str:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post("https://testnet.hashio.io/api", json=payload)
        resp.raise_for_status()
        result = resp.json()
    if "error" in result:
        raise RuntimeError(f"eth_call failed: {result['error']}")
    return result.get("result", "0x")


async def _eth_get_transaction_count(address: str) -> int:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getTransactionCount",
        "params": [address, "latest"],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post("https://testnet.hashio.io/api", json=payload)
        resp.raise_for_status()
        result = resp.json()
    if "error" in result or "result" not in result:
        return 0
    return int(result["result"], 16)


@tool
async def build_recurring_hbar_transfer_actions(
    user_evm_address: str, recipient_evm_address: str, amount_hbar: float, interval_seconds: int
) -> str:
    """Build a multi-step transaction sequence for an EVM wallet (MetaMask) to set up
    a recurring HBAR transfer using Hedera's Schedule Service (HSS) precompile.

    `user_evm_address` is the sender's EVM address (0x...).
    `recipient_evm_address` is the recipient EVM address (0x...) or native Hedera account ID (0.0.x).
    `amount_hbar` is the amount per execution in HBAR (e.g. 1.0).
    `interval_seconds` is the frequency in seconds (e.g. 3600 for hourly).
    Returns a JSON action payload with steps: createVault (if needed), configure, deposit, scheduleNextRun.
    """
    settings = get_settings()
    factory_address = settings.hedera_schedule_factory_address
    strategy_address = settings.hedera_native_transfer_strategy_address

    resolved_recipient = await resolve_evm_address(recipient_evm_address)
    try:
        _encode_address(user_evm_address)
        _encode_address(resolved_recipient)
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    amount_wei = int(round(amount_hbar * 1e18))
    hex_value = "0x" + format(amount_wei, "x")

    existing_vault = "0x0000000000000000000000000000000000000000"
    if factory_address != "0x0000000000000000000000000000000000000000":
        try:
            call_data = "0x" + GET_LATEST_USER_VAULT_SELECTOR + _encode_address(user_evm_address)
            res = await _eth_call(factory_address, call_data)
            if res and res != "0x" and len(res) >= 66:
                addr = "0x" + res[-40:]
                if addr != "0x0000000000000000000000000000000000000000":
                    existing_vault = addr
        except Exception:
            pass

    if factory_address == "0x0000000000000000000000000000000000000000":
        import time

        hss_precompile = "0x000000000000000000000000000000000000016b"
        delay = max(interval_seconds, 3600)
        expiry_second = int(time.time()) + delay
        hours = delay // 3600
        time_desc = f"{hours}h" if hours >= 1 else f"{delay}s"
        gas_limit = 100000
        # scheduleCall's `value` arg is HBAR in tinybars (1e8/HBAR), not wei (1e18/HBAR).
        amount_tinybar = int(round(amount_hbar * 1e8))
        SCHEDULE_CALL_SELECTOR = "6f5bfde8"
        # scheduleCall(address,uint256,uint256,uint64,bytes) has a trailing dynamic
        # `bytes callData` param, so its head slot must hold an offset (5 head words *
        # 32 bytes = 0xa0) pointing past the head, not the bytes payload inlined —
        # otherwise the EVM reads the `address` word above as the bytes length and reverts.
        calldata = (
            "0x"
            + SCHEDULE_CALL_SELECTOR
            + _encode_address(resolved_recipient)
            + _encode_uint(expiry_second)
            + _encode_uint(gas_limit)
            + _encode_uint(amount_tinybar)
            + _encode_uint(0xA0)
            + _encode_bytes_payload(b"")
        )
        payload = {
            "human_message": f"Schedule transfer of {amount_hbar} HBAR to {resolved_recipient} (executes in {time_desc} via Hedera Schedule Service 0x16b)",
            "to": hss_precompile,
            "value": "0x0",
            "data": calldata,
        }
        return json.dumps(payload)

    steps = []
    target_vault = existing_vault

    if existing_vault == "0x0000000000000000000000000000000000000000":
        steps.append(
            {
                "label": "Create Scheduled Vault",
                "to": factory_address,
                "data": "0x" + CREATE_VAULT_SELECTOR + _encode_address(strategy_address),
                "value": "0x0",
            }
        )
        nonce = 0
        if factory_address != "0x0000000000000000000000000000000000000000":
            try:
                nonce = await _eth_get_transaction_count(factory_address)
            except Exception:
                pass
        target_vault = predict_contract_address(factory_address, nonce)

    config_bytes = bytes.fromhex(_encode_address(resolved_recipient) + _encode_uint(amount_wei))
    configure_data = "0x" + CONFIGURE_SELECTOR + encode_configure(config_bytes, interval_seconds)

    steps.extend(
        [
            {
                "label": f"Configure recurring transfer ({amount_hbar} HBAR every {interval_seconds}s)",
                "to": target_vault,
                "data": configure_data,
                "value": "0x0",
            },
            {
                "label": f"Deposit {amount_hbar} HBAR to fund execution",
                "to": target_vault,
                "data": "0x" + DEPOSIT_SELECTOR,
                "value": hex_value,
            },
            {
                "label": "Schedule next execution on Hedera",
                "to": target_vault,
                "data": "0x" + SCHEDULE_NEXT_RUN_SELECTOR,
                "value": "0x0",
            },
        ]
    )

    payload = {
        "human_message": f"Schedule recurring transfer of {amount_hbar} HBAR to {resolved_recipient} every {interval_seconds} seconds",
        "steps": steps,
    }
    return json.dumps(payload)

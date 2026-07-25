"""Hedera EVM wallet action tools — plain HBAR transfers via Hedera's JSON-RPC relay.

Builds single-step eth_sendTransaction payloads for EVM wallets (e.g. MetaMask)
connected to Hedera testnet (chain ID 296).
"""

import json
from langchain_core.tools import tool

from app.tools.hedera_mirror import get_hedera_account


async def resolve_evm_address(account_id_or_evm: str) -> str:
    account_id_or_evm = account_id_or_evm.strip()
    if account_id_or_evm.startswith("0x") or account_id_or_evm.startswith("0X"):
        return account_id_or_evm.lower()

    if account_id_or_evm.startswith("0.0."):
        try:
            account_data = await get_hedera_account.ainvoke({"account_id": account_id_or_evm})
            if isinstance(account_data, dict):
                evm_addr = account_data.get("evm_address")
                if evm_addr and isinstance(evm_addr, str) and evm_addr.startswith("0x"):
                    return evm_addr.lower()
        except Exception:
            pass

        try:
            num = int(account_id_or_evm.split(".")[-1])
            return f"0x{num:040x}"
        except ValueError:
            pass

    return account_id_or_evm


@tool
async def build_hbar_transfer_evm_tx(to_evm_address: str, amount_hbar: float) -> str:
    """Build a single-step plain HBAR transfer transaction for an EVM wallet (MetaMask) on Hedera testnet.

    `to_evm_address` is the recipient EVM address (0x...) or native Hedera account ID (0.0.x).
    `amount_hbar` is the transfer amount in HBAR (e.g. 1.0).
    Returns a JSON payload with human_message, to, value (hex wei with 18 decimals), and data='0x'.
    """
    resolved_to = await resolve_evm_address(to_evm_address)
    wei = int(round(amount_hbar * 1e18))
    hex_value = "0x" + format(wei, "x")

    payload = {
        "human_message": f"Transfer {amount_hbar} HBAR to {resolved_to}",
        "to": resolved_to,
        "value": hex_value,
        "data": "0x",
    }
    return json.dumps(payload)

"""Hedera EVM wallet action tools — HBAR transfers and HTS token creation via Hedera's EVM precompiles and JSON-RPC relay.

Builds single-step eth_sendTransaction payloads for EVM wallets (e.g. MetaMask)
connected to Hedera testnet (chain ID 296).
"""

import json

from eth_abi import encode
from eth_utils import keccak
from langchain_core.tools import tool

from app.tools.hedera_mirror import get_hedera_account

HTS_SYSTEM_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000167"

_HEDERA_TOKEN_TYPE_SIG = (
    "(string,string,address,string,bool,int64,bool,"
    "(uint256,(bool,address,bytes,bytes,address))[],"
    "(int64,address,int64))"
)
_CREATE_FUNGIBLE_TOKEN_SIG = f"createFungibleToken({_HEDERA_TOKEN_TYPE_SIG},uint64,uint32)"
CREATE_FUNGIBLE_TOKEN_SELECTOR = keccak(_CREATE_FUNGIBLE_TOKEN_SIG.encode("utf-8"))[:4].hex()


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


@tool
async def build_hts_create_token_evm_tx(
    user_evm_address: str,
    name: str,
    symbol: str,
    initial_supply: float = 1000000.0,
    decimals: int = 2,
    memo: str = "Created via ChainScope",
) -> str:
    """Build a single-step transaction for an EVM wallet (MetaMask) to create a new HTS fungible token
    via the Hedera Token Service system contract (0x0000000000000000000000000000000000000167).

    `user_evm_address` is the creator/treasury EVM address (0x...).
    `name` is the token name (e.g. "My Token").
    `symbol` is the token symbol (e.g. "MTK").
    `initial_supply` is the initial supply of tokens to mint (e.g. 1000000.0).
    `decimals` is the number of decimal places (e.g. 2).
    `memo` is an optional description memo.
    Returns a JSON payload with human_message, to, value (hex wei with 30 HBAR creation fee estimate), and data (calldata hex).
    """
    resolved_user = await resolve_evm_address(user_evm_address)
    if not resolved_user.startswith("0x") or len(resolved_user) != 42:
        return json.dumps({"error": f"Invalid user EVM address: {user_evm_address!r}"})

    empty_addr = "0x0000000000000000000000000000000000000000"
    key_value = (True, empty_addr, b"", b"", empty_addr)
    # Admin key (1) and Supply key (16) configured to inherit account key
    token_keys = [(1, key_value), (16, key_value)]
    expiry = (0, empty_addr, 7890000)

    token_struct = (
        name,
        symbol,
        resolved_user,
        memo,
        False,  # False for INFINITE supply type
        0,  # maxSupply (0 for infinite)
        False,  # freezeDefault
        token_keys,
        expiry,
    )

    raw_supply = int(round(initial_supply * (10**decimals)))
    encoded_bytes = encode(
        [_HEDERA_TOKEN_TYPE_SIG, "uint64", "uint32"],
        [token_struct, raw_supply, decimals],
    )

    calldata = "0x" + CREATE_FUNGIBLE_TOKEN_SELECTOR + encoded_bytes.hex()
    # Estimate network token creation fee: 30 HBAR in wei (excess is refunded by Hedera)
    creation_fee_wei = int(round(30 * 1e18))
    hex_value = "0x" + format(creation_fee_wei, "x")

    payload = {
        "human_message": f"Create HTS fungible token {name} ({symbol}) with initial supply {initial_supply:,.0f}"
        if initial_supply == int(initial_supply)
        else f"Create HTS fungible token {name} ({symbol}) with initial supply {initial_supply:,}",
        "to": HTS_SYSTEM_CONTRACT_ADDRESS,
        "value": hex_value,
        "data": calldata,
    }
    return json.dumps(payload)

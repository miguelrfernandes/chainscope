"""Shared ABI-encoding helpers for hand-rolled EVM calldata builders.

Every tool that builds raw calldata (aave_actions, uniswap_actions,
uniswap_lp_actions, hedera_schedule_actions, saucerswap_actions) needs the
same handful of 32-byte-word encoders. Centralised here so there's exactly
one place to fix an encoding bug, and so malformed addresses are rejected
before they reach calldata a user's wallet will be asked to sign.
"""

import re

_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")

CHAIN_NETWORK_NAMES: dict[int, str] = {
    1: "Ethereum Mainnet",
    8453: "Base",
    11155111: "Sepolia",
}


def network_name(chain_id: int) -> str:
    return CHAIN_NETWORK_NAMES.get(chain_id, f"Chain {chain_id}")


def _encode_address(address: str) -> str:
    if not _ADDRESS_RE.match(address):
        raise ValueError(f"Invalid EVM address: {address!r}")
    return address.lower().removeprefix("0x").rjust(64, "0")


def _encode_uint(value: int) -> str:
    return format(value, "x").rjust(64, "0")


def _encode_int(value: int) -> str:
    """Two's complement 256-bit encoding for signed ints (e.g. tick values)."""
    if value >= 0:
        return format(value, "x").rjust(64, "0")
    return format(value & (2**256 - 1), "x").rjust(64, "0")


def _encode_bytes_payload(data: bytes) -> str:
    """ABI-encodes a dynamic `bytes` value's length + right-padded content
    (the part that goes at the tail offset, not the head-word)."""
    length_word = _encode_uint(len(data))
    padded_len = ((len(data) + 31) // 32) * 32
    data_hex = data.hex().ljust(padded_len * 2, "0")
    return length_word + data_hex

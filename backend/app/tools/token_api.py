"""Client for Pinax's Token API (api.pinax.network) — normalized cross-chain
wallet balances/transfers, used by the portfolio specialist. See
docs/graph-api.md's "Token API" section.
"""

from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings


async def _get(path: str, params: dict[str, Any]) -> dict:
    settings = get_settings()
    headers = {"Authorization": f"Bearer {settings.pinax_api_token}", "Accept": "application/json"}
    async with httpx.AsyncClient(base_url=settings.pinax_api_base_url, timeout=15) as client:
        resp = await client.get(path, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()


@tool
async def get_wallet_balances(address: str, network: str = "sepolia") -> dict:
    """Get current ERC-20 + native token balances for an EVM wallet address.

    `network` is a Pinax network slug. We are testnet-only for now: always use
    "sepolia" (Ethereum Sepolia testnet)."""
    return await _get("/v1/evm/balances", {"address": address, "network": network})


@tool
async def get_wallet_transfers(address: str, network: str = "sepolia", limit: int = 10) -> dict:
    """Get recent token transfer history (in and out) for an EVM wallet address.

    `network` is a Pinax network slug. We are testnet-only for now: always use
    "sepolia" (Ethereum Sepolia testnet)."""
    return await _get("/v1/evm/transfers", {"address": address, "network": network, "limit": limit})


TOKEN_API_TOOLS = [get_wallet_balances, get_wallet_transfers]

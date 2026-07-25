"""Client for Pinax's Token API (api.pinax.network) — normalized cross-chain
wallet balances/transfers, used by the portfolio specialist. See
docs/graph-api.md's "Token API" section.
"""

from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings


SEPOLIA_TOKENS: dict[str, dict[str, Any]] = {
    "USDC": {"address": "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", "decimals": 6},
    "DAI": {"address": "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", "decimals": 18},
    "LINK": {"address": "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", "decimals": 18},
    "WETH": {"address": "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", "decimals": 18},
}


async def _get(path: str, params: dict[str, Any]) -> dict:
    settings = get_settings()
    headers = {"Authorization": f"Bearer {settings.pinax_api_token}", "Accept": "application/json"}
    async with httpx.AsyncClient(base_url=settings.pinax_api_base_url, timeout=15) as client:
        resp = await client.get(path, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def _get_sepolia_rpc_balances(address: str) -> dict:
    settings = get_settings()
    addr_encoded = address.lower().removeprefix("0x").rjust(64, "0")
    call_data = f"0x70a08231{addr_encoded}"

    balances = []

    async with httpx.AsyncClient(timeout=10) as client:
        # 1. Native ETH balance
        payload_eth = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getBalance",
            "params": [address, "latest"],
        }
        try:
            resp = await client.post(settings.sepolia_rpc_url, json=payload_eth)
            res = resp.json()
            if "result" in res and res["result"] != "0x":
                eth_val = int(res["result"], 16) / 1e18
                balances.append({"symbol": "ETH", "balance": eth_val, "contract": None, "type": "native"})
        except Exception as exc:  # noqa: BLE001
            balances.append({"symbol": "ETH", "error": str(exc)})

        # 2. Known Sepolia ERC20 balances
        for symbol, info in SEPOLIA_TOKENS.items():
            payload_token = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "eth_call",
                "params": [{"to": info["address"], "data": call_data}, "latest"],
            }
            try:
                resp = await client.post(settings.sepolia_rpc_url, json=payload_token)
                res = resp.json()
                if "result" in res and res["result"] != "0x":
                    val = int(res["result"], 16) / (10 ** info["decimals"])
                    balances.append({"symbol": symbol, "balance": val, "contract": info["address"], "type": "erc20"})
            except Exception:  # noqa: BLE001
                continue

    return {
        "network": "sepolia",
        "address": address,
        "data": balances,
    }


@tool
async def get_wallet_balances(address: str, network: str = "sepolia") -> dict:
    """Get current ERC-20 + native token balances for an EVM wallet address.

    `network` is a network slug. Uses live Sepolia RPC for "sepolia", or Pinax
    Token API for mainnet networks like "mainnet", "polygon", "arbitrum-one", "base"."""
    if network.lower() == "sepolia":
        return await _get_sepolia_rpc_balances(address)
    try:
        return await _get("/v1/evm/balances", {"address": address, "network": network})
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            return await _get_sepolia_rpc_balances(address)
        raise


@tool
async def get_wallet_transfers(address: str, network: str = "sepolia", limit: int = 10) -> dict:
    """Get recent token transfer history (in and out) for an EVM wallet address.

    `network` is a network slug. Uses Pinax Token API for mainnet networks like "mainnet", "polygon"."""
    if network.lower() == "sepolia":
        return {
            "network": "sepolia",
            "address": address,
            "transfers": [],
            "note": "Live Sepolia RPC does not index historical transfers; use mainnet for Pinax transfers API.",
        }
    try:
        return await _get("/v1/evm/transfers", {"address": address, "network": network, "limit": limit})
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            return {
                "network": network,
                "address": address,
                "transfers": [],
                "note": f"Pinax Token API returned 400 for network '{network}'.",
            }
        raise


TOKEN_API_TOOLS = [get_wallet_balances, get_wallet_transfers]


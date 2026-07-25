"""Client for the Hedera Mirror Node REST API — public, read-only, no API key
(https://{network}.mirrornode.hedera.com). Used by the Hedera specialist for
account/token/HCS data, the same role Subgraph MCP plays for EVM chains. See
docs/agents.md.
"""

from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings

TINYBARS_PER_HBAR = 100_000_000


async def _get(path: str, params: dict[str, Any] | None = None) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(base_url=settings.hedera_mirror_node_base_url, timeout=15) as client:
        resp = await client.get(path, params=params or {})
        resp.raise_for_status()
        return resp.json()


@tool
async def get_hedera_account(account_id: str) -> dict:
    """Get a Hedera account's details: HBAR balance, key, memo, staking info.

    `account_id` is a Hedera account ID like "0.0.1234" (or an EVM-style
    0x... alias address)."""
    return await _get(f"/api/v1/accounts/{account_id}")


@tool
async def get_connected_user_wallet(address_or_id: str) -> dict:
    """Fetch the connected user's wallet details, resolving EVM hex addresses
    (0x...) or native Hedera account IDs (0.0.x) to full account info, balance,
    and native Hedera account ID via Hedera Mirror Node.

    `address_or_id` is the user's connected wallet address or account ID."""
    return await _get(f"/api/v1/accounts/{address_or_id}")



@tool
async def get_hedera_account_tokens(account_id: str, limit: int = 25) -> dict:
    """Get the HTS tokens (fungible + NFT collections) held by a Hedera account,
    with balances.

    `account_id` is a Hedera account ID like "0.0.1234"."""
    return await _get(f"/api/v1/accounts/{account_id}/tokens", {"limit": limit})


@tool
async def get_hedera_account_nfts(account_id: str, token_id: str | None = None, limit: int = 25) -> dict:
    """Get NFTs owned by a Hedera account, optionally filtered to one token
    (collection) ID.

    `account_id` is a Hedera account ID like "0.0.1234"; `token_id` (optional)
    restricts results to one NFT collection, e.g. "0.0.5678"."""
    params: dict[str, Any] = {"limit": limit}
    if token_id:
        params["token.id"] = token_id
    return await _get(f"/api/v1/accounts/{account_id}/nfts", params)


@tool
async def get_hedera_account_transactions(account_id: str, limit: int = 10) -> dict:
    """Get recent transactions (transfers, contract calls, token operations)
    for a Hedera account, most recent first.

    `account_id` is a Hedera account ID like "0.0.1234"."""
    return await _get("/api/v1/transactions", {"account.id": account_id, "limit": limit, "order": "desc"})


@tool
async def get_hedera_token_info(token_id: str) -> dict:
    """Get an HTS token's metadata: name, symbol, type (fungible/NFT), total
    supply, decimals, treasury account.

    `token_id` is a Hedera token ID like "0.0.5678"."""
    return await _get(f"/api/v1/tokens/{token_id}")


@tool
async def get_hedera_topic_messages(topic_id: str, limit: int = 10) -> dict:
    """Get recent messages submitted to a Hedera Consensus Service (HCS) topic,
    most recent first.

    `topic_id` is a Hedera topic ID like "0.0.9101"."""
    return await _get(f"/api/v1/topics/{topic_id}/messages", {"limit": limit, "order": "desc"})


def to_mirror_node_transaction_id(transaction_id: str) -> str:
    """Convert an SDK-style transaction ID ("0.0.1234@1699999999.123456789",
    as returned by Transaction.transactionId.toString()) into the dash-separated
    form the Mirror Node's /transactions/{id} endpoint expects
    ("0.0.1234-1699999999-123456789"). Already-dashed IDs pass through
    unchanged."""
    if "@" not in transaction_id:
        return transaction_id
    account_id, timestamp = transaction_id.split("@", 1)
    seconds, nanos = timestamp.split(".", 1)
    return f"{account_id}-{seconds}-{nanos}"


async def get_transaction_by_id(transaction_id: str) -> dict:
    """Look up a transaction's broadcast status on Hedera Mirror Node by its
    transaction ID. Not exposed as an agent tool — used by the
    confirm-agent webhook (app/api/agent_actions.py) to verify a signed seed
    funding transfer actually landed on-chain before activating an agent."""
    return await _get(f"/api/v1/transactions/{to_mirror_node_transaction_id(transaction_id)}")


HEDERA_MIRROR_TOOLS = [
    get_connected_user_wallet,
    get_hedera_account,
    get_hedera_account_tokens,
    get_hedera_account_nfts,
    get_hedera_account_transactions,
    get_hedera_token_info,
    get_hedera_topic_messages,
]

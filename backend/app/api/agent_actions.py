"""Confirmation webhook for the managed Hedera agent provisioning flow (see
app/tools/hedera_provisioner.py). A newly provisioned agent is just a
generated ECDSA key with a real EVM address — its Hedera account doesn't
exist on-chain yet, and the agent stays "PENDING" until its 1 HBAR seed
funding transfer auto-creates it. After the user signs that transfer,
frontend/src/components/SeedAgentCard.tsx posts the resulting transaction ID
here; we verify the transaction against Hedera Mirror Node, then resolve the
real account_id that Auto Account Creation assigned (unknowable until now)
before flipping the agent to "ACTIVE" — so a rejected or failed signature
never activates an agent.
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.agent_store import get_agent_by_name, set_agent_account_and_status
from app.tools.hedera_mirror import get_account_by_address_or_id, get_transaction_by_id

router = APIRouter(prefix="/api/actions")

# The seed funding action always asks for exactly 1 HBAR (see
# hedera_provisioner.py) — a balance below this can't be the real seed funding.
SEED_AMOUNT_TINYBARS = 100_000_000


class ConfirmAgentRequest(BaseModel):
    owner_address: str
    agent_name: str
    tx_id: str


@router.post("/confirm-agent")
async def confirm_agent(req: ConfirmAgentRequest):
    agent = get_agent_by_name(req.owner_address, req.agent_name)
    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"No managed agent named '{req.agent_name}' for this wallet.",
        )

    try:
        result = await get_transaction_by_id(req.tx_id)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not verify transaction on Hedera Mirror Node: {exc}",
        ) from exc

    transactions = result.get("transactions", [])
    if not any(tx.get("result") == "SUCCESS" for tx in transactions):
        raise HTTPException(
            status_code=400,
            detail="Seed funding transaction was not found or did not succeed.",
        )

    # The agent's account_id isn't known until now — Auto Account Creation
    # assigns it the moment its EVM address first receives funds — so resolve
    # it (and confirm the balance) straight from Mirror Node by EVM address.
    try:
        account_info = await get_account_by_address_or_id(agent["evm_address"])
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Transaction succeeded, but no Hedera account was found yet at "
            f"{agent['evm_address']} (mirror node may still be indexing): {exc}",
        ) from exc

    balance = (account_info.get("balance") or {}).get("balance", 0)
    if balance < SEED_AMOUNT_TINYBARS:
        raise HTTPException(
            status_code=400,
            detail=f"Seed funding did not credit {agent['evm_address']} with at least 1 HBAR "
            f"(current balance: {balance} tinybars).",
        )

    resolved_account_id = account_info.get("account") or ""
    set_agent_account_and_status(req.owner_address, req.agent_name, resolved_account_id, "ACTIVE")
    return {
        "status": "ACTIVE",
        "agent": {
            "agent_name": agent["agent_name"],
            "account_id": resolved_account_id,
            "evm_address": agent["evm_address"],
            "status": "ACTIVE",
            "created_at": agent["created_at"],
        },
    }

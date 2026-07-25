"""Confirmation webhook for the managed Hedera agent provisioning flow (see
app/tools/hedera_provisioner.py). A newly provisioned agent starts life in
the Vault with status "PENDING" until its 1 HBAR seed funding transfer is
confirmed on-chain. After the user signs that transfer in HashConnect,
frontend/src/components/HederaActionCard.tsx posts the resulting transaction
ID here; we verify it against Hedera Mirror Node before flipping the agent
to "ACTIVE", so a rejected or failed signature never activates an agent.
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.agent_store import get_agent_by_name, set_agent_status
from app.tools.hedera_mirror import get_transaction_by_id

router = APIRouter(prefix="/api/actions")

# The seed funding action always asks for exactly 1 HBAR (see
# hedera_provisioner.py) — a transfer credits the agent's account with
# fewer tinybars than this can't be the real seed transaction.
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

    def _funds_agent(tx: dict) -> bool:
        if tx.get("result") != "SUCCESS":
            return False
        return any(
            transfer.get("account") == agent["account_id"]
            and transfer.get("amount", 0) >= SEED_AMOUNT_TINYBARS
            for transfer in tx.get("transfers", [])
        )

    if not any(_funds_agent(tx) for tx in transactions):
        raise HTTPException(
            status_code=400,
            detail="Seed funding transaction was not found, did not succeed, or did not "
            f"credit {agent['account_id']} with at least 1 HBAR.",
        )

    set_agent_status(req.owner_address, req.agent_name, "ACTIVE")
    return {
        "status": "ACTIVE",
        "agent": {
            "agent_name": agent["agent_name"],
            "account_id": agent["account_id"],
            "status": "ACTIVE",
            "created_at": agent["created_at"],
        },
    }

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

import asyncio

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.agent_store import (
    get_agent_by_name,
    get_user_agents,
    set_agent_account_and_status,
)
from app.tools.hedera_mirror import get_account_by_address_or_id, get_transaction_by_id

router = APIRouter()

# The seed funding action always asks for exactly 1 HBAR (see
# hedera_provisioner.py) — a balance below this can't be the real seed funding.
SEED_AMOUNT_TINYBARS = 100_000_000


class ConfirmAgentRequest(BaseModel):
    owner_address: str
    agent_name: str
    tx_id: str


@router.post("/api/actions/confirm-agent")
async def confirm_agent(req: ConfirmAgentRequest):
    agent = get_agent_by_name(req.owner_address, req.agent_name)
    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"No managed agent named '{req.agent_name}' for this wallet.",
        )

    tx_succeeded = False
    try:
        result = await get_transaction_by_id(req.tx_id)
        transactions = result.get("transactions", [])
        tx_succeeded = any(tx.get("result") == "SUCCESS" for tx in transactions)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not verify transaction on Hedera Mirror Node: {exc}",
        ) from exc

    # The agent's account_id isn't known until now — Auto Account Creation
    # assigns it the moment its EVM address first receives funds. Mirror node
    # indexing may take a few seconds after the transaction is submitted, so
    # retry checking the account record for up to ~15 seconds.
    account_info = {}
    last_exc = None
    for attempt in range(10):
        try:
            account_info = await get_account_by_address_or_id(agent["evm_address"])
            resolved_acc = account_info.get("account") or ""
            balance = (account_info.get("balance") or {}).get("balance", 0)
            if resolved_acc and balance >= SEED_AMOUNT_TINYBARS:
                break
        except httpx.HTTPError as exc:
            last_exc = exc
        if attempt < 9:
            await asyncio.sleep(1.5)

    balance = (account_info.get("balance") or {}).get("balance", 0)
    resolved_account_id = account_info.get("account") or ""

    if not resolved_account_id or balance < SEED_AMOUNT_TINYBARS:
        if not tx_succeeded:
            if last_exc:
                raise HTTPException(
                    status_code=400,
                    detail="Seed funding transaction was not found or did not succeed.",
                ) from last_exc
            raise HTTPException(
                status_code=400,
                detail="Seed funding transaction was not found or did not succeed.",
            )
        raise HTTPException(
            status_code=400,
            detail=f"Transaction succeeded, but no Hedera account was found yet at "
            f"{agent['evm_address']} (mirror node may still be indexing).",
        )

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


@router.get("/api/agents")
@router.get("/api/actions/agents")
async def list_agents(owner_address: str):
    raw_agents = get_user_agents(owner_address)
    agents_out = []
    for agent in raw_agents:
        balance_hbar = 0.0
        lookup_id = agent.get("account_id") or agent.get("evm_address")
        status = agent.get("status", "PENDING")
        account_id = agent.get("account_id", "")
        if lookup_id:
            try:
                account_info = await get_account_by_address_or_id(lookup_id)
                balance_tinybars = (account_info.get("balance") or {}).get("balance", 0)
                balance_hbar = balance_tinybars / SEED_AMOUNT_TINYBARS

                # Auto-activate PENDING agents if Mirror Node shows on-chain creation & funding
                resolved_acc = account_info.get("account") or ""
                if (
                    status == "PENDING"
                    and resolved_acc
                    and balance_tinybars >= SEED_AMOUNT_TINYBARS
                ):
                    set_agent_account_and_status(
                        owner_address, agent["agent_name"], resolved_acc, "ACTIVE"
                    )
                    status = "ACTIVE"
                    account_id = resolved_acc
            except Exception:
                balance_hbar = 0.0

        agents_out.append(
            {
                "agent_name": agent.get("agent_name"),
                "account_id": account_id,
                "evm_address": agent.get("evm_address", ""),
                "status": status,
                "balance_hbar": balance_hbar,
                "created_at": agent.get("created_at", ""),
            }
        )
    return agents_out


@router.delete("/api/agents/{agent_name}")
async def delete_agent_endpoint(agent_name: str, owner_address: str):
    from app.core.agent_store import archive_agent

    archived = archive_agent(owner_address, agent_name)
    if not archived:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found or already archived for owner '{owner_address}'.",
        )
    return {"status": "success", "agent_name": agent_name, "action": "archived"}


@router.post("/api/agents/{agent_name}/unarchive")
@router.post("/api/agents/{agent_name}/restore")
async def unarchive_agent_endpoint(agent_name: str, owner_address: str):
    from app.core.agent_store import unarchive_agent

    restored = unarchive_agent(owner_address, agent_name)
    if not restored:
        raise HTTPException(
            status_code=404,
            detail=f"Archived agent '{agent_name}' not found for owner '{owner_address}'.",
        )
    return {"status": "success", "agent_name": agent_name, "action": "unarchived"}


@router.get("/api/scheduler/jobs")
async def get_scheduled_jobs():
    from app.core.scheduler import list_scheduled_jobs

    jobs = list_scheduled_jobs()
    res = []
    for j in jobs:
        item = dict(j)
        item["job_id"] = j.get("id")
        res.append(item)
    return res


@router.delete("/api/scheduler/jobs/{job_id}")
async def delete_scheduled_job(job_id: str):
    from app.core.scheduler import remove_scheduled_job

    removed = remove_scheduled_job(job_id)
    if not removed:
        raise HTTPException(
            status_code=404,
            detail=f"Scheduled job '{job_id}' not found.",
        )
    return {"status": "success", "job_id": job_id}

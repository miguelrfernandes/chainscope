"""API endpoints for managing generic scheduled question queries and viewing run inbox histories."""

import hmac

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.scheduled_query_store import (
    archive_query,
    get_query_by_id,
    get_runs_for_query,
    get_unread_runs,
    get_user_queries,
    mark_run_read,
    save_query,
)
from app.core.scheduler import (
    remove_scheduled_job,
    run_due_queries,
    schedule_query_job,
    validate_cron_expression,
)

router = APIRouter()


class CreateScheduledQueryRequest(BaseModel):
    owner_address: str
    name: str
    prompt: str
    cron_expression: str = "0 8 * * *"


@router.post("/api/scheduled-queries")
async def create_scheduled_query(req: CreateScheduledQueryRequest):
    if not req.owner_address or not req.name or not req.prompt or not req.cron_expression:
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        validate_cron_expression(req.cron_expression)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    query = save_query(
        owner_address=req.owner_address,
        name=req.name,
        prompt=req.prompt,
        cron_expression=req.cron_expression,
    )
    try:
        job_id = schedule_query_job(query_id=query["id"], cron_expression=req.cron_expression)
    except ValueError as exc:
        archive_query(query["id"])
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Re-read: scheduling is what assigns next_run_at, so the row returned by
    # save_query above still carries the pre-scheduling NULL.
    query = get_query_by_id(query["id"]) or query
    query["job_id"] = job_id
    return query


@router.post("/api/scheduled-queries/tick")
async def tick_scheduled_queries(authorization: str | None = Header(default=None)):
    """Run every scheduled query that is now due.

    This is the external-cron counterpart to the in-process APScheduler: on a
    serverless host nothing is alive between requests to fire a trigger, so
    something outside (GitHub Actions) has to POST here on a schedule.

    Firing agent runs is a side effect worth protecting, so the endpoint
    refuses to serve unless CRON_SECRET is configured and matches — an
    unauthenticated tick would let anyone who guesses the URL drive the
    user's scheduled Hedera actions.
    """
    secret = get_settings().cron_secret
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="CRON_SECRET is not configured; refusing to run scheduled queries.",
        )

    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented, secret):
        raise HTTPException(status_code=401, detail="Invalid or missing cron credentials.")

    return await run_due_queries()


@router.get("/api/scheduled-queries")
async def list_scheduled_queries(owner_address: str):
    return get_user_queries(owner_address)


@router.delete("/api/scheduled-queries/{id}")
async def delete_scheduled_query(id: int, owner_address: str):
    job_id = f"query-{id}"
    remove_scheduled_job(job_id)
    archived = archive_query(id, owner_address)
    if not archived:
        raise HTTPException(
            status_code=404,
            detail=f"Scheduled query '{id}' not found or already archived for owner '{owner_address}'.",
        )
    return {"status": "success", "id": id, "action": "archived"}


@router.get("/api/scheduled-queries/{id}/runs")
async def list_query_runs(id: int, owner_address: str):
    return get_runs_for_query(id, owner_address)


@router.post("/api/scheduled-queries/runs/{run_id}/read")
async def mark_query_run_read(run_id: int, owner_address: str | None = None):
    updated = mark_run_read(run_id, owner_address)
    if not updated:
        raise HTTPException(
            status_code=404,
            detail=f"Run '{run_id}' not found or already marked as read.",
        )
    return {"status": "success", "run_id": run_id, "is_read": 1}


@router.get("/api/inbox")
async def get_inbox_summary(owner_address: str):
    unread_runs = get_unread_runs(owner_address)
    return {
        "unread_count": len(unread_runs),
        "latest_unread": unread_runs[:10],
    }

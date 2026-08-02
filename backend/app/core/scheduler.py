"""Embedded In-Process APScheduler — manages background cron jobs backed by
SQLite persistence for autonomous agent operations.

On schedule trigger (e.g., daily rebalance "0 0 * * *"), fetches agent
credentials from Vault, decrypts the agent's ED25519 private key, and
executes autonomous Hedera actions (e.g. transfers/rebalances).
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from hiero_sdk_python import AccountId, Client, Hbar, Network, PrivateKey, TransferTransaction

from app.core.config import get_settings
from app.tools.hedera_provisioner import Vault, decrypt_private_key

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> Optional[AsyncIOScheduler]:
    """Return the global AsyncIOScheduler instance if initialized."""
    return _scheduler


def is_external_mode() -> bool:
    """Whether cron firing is owned by something outside this process.

    On a serverless host nothing stays alive between requests, so an
    in-process scheduler would simply never fire. In that mode the schedule
    lives in the database as `scheduled_queries.next_run_at` and an external
    cron POSTs /api/scheduled-queries/tick to drive it.
    """
    return get_settings().scheduler_mode.lower() == "external"


def init_scheduler(db_path: Optional[str] = None) -> Optional[AsyncIOScheduler]:
    """Initialize and start the global AsyncIOScheduler with a SQLite jobstore.
    If already initialized and running, returns the active instance. Returns
    None in external mode, where no in-process scheduler is wanted.
    """
    global _scheduler

    if is_external_mode():
        logger.info("Scheduler in external mode — skipping in-process APScheduler")
        return None

    if _scheduler is not None and _scheduler.running:
        return _scheduler

    settings = get_settings()
    target_db = db_path or settings.scheduler_db_path

    if settings.database_url:
        # SQLAlchemyJobStore speaks any SQLAlchemy URL; on Postgres the
        # jobstore belongs next to the rest of the data, not on a local disk
        # that may not persist. SQLAlchemy still defaults a bare
        # postgresql:// URL to psycopg2, which isn't installed — psycopg 3 is
        # — so name the driver explicitly.
        db_url = settings.database_url
        if db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif target_db != ":memory:":
        Path(target_db).parent.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{target_db}"
    else:
        db_url = "sqlite://"

    jobstores = {"default": SQLAlchemyJobStore(url=db_url)}

    _scheduler = AsyncIOScheduler(jobstores=jobstores)
    try:
        _scheduler.start()
        logger.info("Embedded APScheduler initialized with SQLite jobstore (%s)", db_url)
    except RuntimeError:
        logger.warning("AsyncIOScheduler initialized without running event loop (%s)", db_url)
    return _scheduler


def shutdown_scheduler() -> None:
    """Safely shut down the global AsyncIOScheduler."""
    global _scheduler
    if _scheduler is not None:
        if _scheduler.running:
            try:
                _scheduler.shutdown(wait=False)
                logger.info("Embedded APScheduler shut down.")
            except RuntimeError:
                logger.debug("APScheduler shutdown caught closed loop.")
        _scheduler = None


def execute_autonomous_hedera_action(
    owner_address: str,
    agent_name: str,
    action_type: str = "rebalance",
    target_account_id: Optional[str] = None,
    amount_hbar: float = 0.0,
) -> Dict[str, Any]:
    """Fetch agent credentials from Vault, decrypt private key, and execute autonomous Hedera actions."""
    agent = Vault.get_agent(owner_address, agent_name)
    if not agent:
        raise ValueError(f"Agent '{agent_name}' for owner '{owner_address}' not found in Vault.")
    if agent.get("status") == "ARCHIVED":
        raise ValueError(f"Agent '{agent_name}' for owner '{owner_address}' is archived.")

    account_id_str = agent["account_id"]
    encrypted_key = agent["encrypted_private_key"]
    private_key_raw = decrypt_private_key(encrypted_key)

    settings = get_settings()
    tx_id = f"0.0.78492@{int(datetime.now(timezone.utc).timestamp())}.000000000"
    message = f"Autonomous {action_type} executed for agent '{agent_name}' ({account_id_str})"

    if settings.hedera_operator_account_id and settings.hedera_operator_private_key:
        tx_status = "success"
        try:
            client = Client(Network(network=settings.hedera_network))
            acc_id = AccountId.from_string(account_id_str)
            pk = PrivateKey.from_string(private_key_raw)
            client.set_operator(acc_id, pk)

            if target_account_id and amount_hbar > 0:
                tx = TransferTransaction()
                tx.add_hbar_transfer(acc_id, Hbar(-amount_hbar))
                tx.add_hbar_transfer(AccountId.from_string(target_account_id), Hbar(amount_hbar))
                tx.set_transaction_memo(f"ChainScope Autonomous {action_type}")
                resp = tx.execute(client)
                receipt = resp.get_receipt(client)
                if resp.transaction_id:
                    tx_id = str(resp.transaction_id)
                if receipt and receipt.status:
                    tx_status = str(receipt.status)
        except Exception as exc:
            logger.warning("Hedera live execution failed: %s", exc)
            tx_status = "failed"
            message += f" (Execution failed: {exc})"
    else:
        tx_status = "simulated"
        message += " (Simulated: no Hedera operator credentials configured)"

    result = {
        "status": tx_status,
        "owner_address": owner_address,
        "agent_name": agent_name,
        "account_id": account_id_str,
        "action_type": action_type,
        "transaction_id": tx_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": message,
    }
    logger.info("Executed autonomous Hedera action: %s", result)
    return result


def run_scheduled_rebalance(
    owner_address: str,
    agent_name: str,
    action_type: str = "rebalance",
    target_account_id: Optional[str] = None,
    amount_hbar: float = 0.0,
) -> Dict[str, Any]:
    """Top-level task handler invoked by APScheduler on cron trigger."""
    return execute_autonomous_hedera_action(
        owner_address=owner_address,
        agent_name=agent_name,
        action_type=action_type,
        target_account_id=target_account_id,
        amount_hbar=amount_hbar,
    )


def schedule_rebalance_job(
    owner_address: str,
    agent_name: str,
    cron_expression: str = "0 0 * * *",
    job_id: Optional[str] = None,
    action_type: str = "rebalance",
    target_account_id: Optional[str] = None,
    amount_hbar: float = 0.0,
) -> str:
    """Schedule a persistent cron job in APScheduler.
    Defaults to daily midnight execution ("0 0 * * *").
    """
    scheduler = get_scheduler()
    if scheduler is None or not scheduler.running:
        scheduler = init_scheduler()

    agent = Vault.get_agent(owner_address, agent_name)
    account_id = agent["account_id"] if agent else "0.0.78492"

    effective_job_id = job_id or f"cron-{agent_name}-{account_id}-{action_type}"
    trigger = CronTrigger.from_crontab(cron_expression)

    scheduler.add_job(
        run_scheduled_rebalance,
        trigger=trigger,
        args=[owner_address, agent_name, action_type, target_account_id, amount_hbar],
        id=effective_job_id,
        replace_existing=True,
    )
    logger.info("Scheduled cron job '%s' with schedule '%s'", effective_job_id, cron_expression)
    return effective_job_id


async def run_scheduled_query(query_id: int) -> dict:
    from app.api.chat import get_graph
    from app.core.scheduled_query_store import get_query_by_id, save_run

    query = get_query_by_id(query_id)
    if not query or query["status"] != "ACTIVE":
        return {}

    try:
        graph = get_graph()
        config = {"configurable": {"thread_id": f"scheduled-{query_id}"}}
        inputs = {
            "question": query["prompt"],
            "route": [],
            "specialist_results": {},
            "raw_data": {},
            "sources": [],
            "artifacts": [],
            "steps": [],
            "final_answer": None,
        }
        result = await graph.ainvoke(inputs, config=config)
        answer = result.get("final_answer") or ""
        sources = result.get("sources") or []
    except Exception as exc:
        logger.warning("Scheduled query %s failed: %s", query_id, exc)
        answer = f"⚠️ This scheduled check failed to run: {exc}"
        sources = []

    save_run(query_id, answer, sources)
    return {"query_id": query_id}


def validate_cron_expression(cron_expression: str) -> CronTrigger:
    """Parse `cron_expression` into a CronTrigger, raising ValueError with a
    clear message on malformed input instead of letting callers hit APScheduler's
    own (less legible) exception deep inside add_job."""
    try:
        return CronTrigger.from_crontab(cron_expression)
    except Exception as exc:
        raise ValueError(f"Invalid cron expression '{cron_expression}': {exc}") from exc


def compute_next_run(cron_expression: str, after: Optional[datetime] = None) -> str:
    """Next UTC fire time for `cron_expression`, as an ISO-8601 string.

    Uses APScheduler's own CronTrigger so external mode and embedded mode
    agree on what a given expression means — CronTrigger computes fire times
    without a running scheduler.
    """
    trigger = validate_cron_expression(cron_expression)
    previous = after or datetime.now(timezone.utc)
    next_fire = trigger.get_next_fire_time(None, previous)
    if next_fire is None:
        raise ValueError(f"Cron expression '{cron_expression}' has no future fire time")
    return next_fire.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def schedule_query_job(query_id: int, cron_expression: str, job_id: Optional[str] = None) -> str:
    from app.core.scheduled_query_store import set_next_run_at

    validate_cron_expression(cron_expression)
    effective_job_id = job_id or f"query-{query_id}"

    # Both modes record next_run_at: it is the source of truth for external
    # ticks, and harmless bookkeeping when APScheduler owns the firing. That
    # also means switching SCHEDULER_MODE doesn't strand existing schedules.
    next_run_at = compute_next_run(cron_expression)
    set_next_run_at(query_id, next_run_at)

    if is_external_mode():
        logger.info(
            "Scheduled query %s for external cron at %s (schedule '%s')",
            query_id,
            next_run_at,
            cron_expression,
        )
        return effective_job_id

    scheduler = get_scheduler() or init_scheduler()
    scheduler.add_job(
        run_scheduled_query,
        trigger=validate_cron_expression(cron_expression),
        args=[query_id],
        id=effective_job_id,
        replace_existing=True,
    )
    logger.info("Scheduled query job '%s' with schedule '%s'", effective_job_id, cron_expression)
    return effective_job_id


async def run_due_queries() -> dict:
    """Run every scheduled query whose next_run_at has passed, then reschedule it.

    Driven by an external cron in serverless deployments. next_run_at is
    advanced even when a run fails, so one broken query can't wedge the tick
    into retrying it forever — the failure is recorded as a run instead (see
    run_scheduled_query).
    """
    from app.core.scheduled_query_store import get_due_queries, set_next_run_at

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    due = get_due_queries(now_iso)

    ran: List[int] = []
    for query in due:
        query_id = query["id"]
        try:
            await run_scheduled_query(query_id)
            ran.append(query_id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Scheduled query %s raised during tick: %s", query_id, exc)
        finally:
            try:
                set_next_run_at(query_id, compute_next_run(query["cron_expression"]))
            except ValueError as exc:
                logger.warning("Could not reschedule query %s: %s", query_id, exc)
                set_next_run_at(query_id, None)

    return {"due": len(due), "ran": ran, "checked_at": now_iso}


def list_scheduled_jobs() -> List[Dict[str, Any]]:
    """List all scheduled jobs currently active in APScheduler."""
    scheduler = get_scheduler()
    if scheduler is None:
        return []

    jobs_info = []
    for job in scheduler.get_jobs():
        next_run = getattr(job, "next_run_time", None)
        jobs_info.append(
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": next_run.isoformat() if next_run else None,
                "trigger": str(getattr(job, "trigger", "")),
                "args": getattr(job, "args", []),
            }
        )
    return jobs_info


def remove_scheduled_job(job_id: str) -> bool:
    """Remove a scheduled job by its job ID."""
    scheduler = get_scheduler()
    if scheduler is None:
        return False

    job = scheduler.get_job(job_id)
    if job is not None:
        scheduler.remove_job(job_id)
        logger.info("Removed scheduled job '%s'", job_id)
        return True
    return False

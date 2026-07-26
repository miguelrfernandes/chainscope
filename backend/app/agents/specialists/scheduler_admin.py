"""Scheduler Admin Specialist Agent — manages generic scheduled natural language question alerts.

Instructs the LLM to parse user prompts like "Set up daily alerts for USDC whale transactions" into self-contained re-runnable questions and schedules them via SQLite + APScheduler.
"""

import json
import re

from langchain_core.tools import tool

from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.core.scheduled_query_store import (
    archive_query,
    get_user_queries,
    save_query,
)
from app.core.scheduler import (
    remove_scheduled_job,
    schedule_query_job,
    validate_cron_expression,
)

LABEL = "Scheduler admin agent"

CONNECTED_WALLET_RE = re.compile(
    r"connected\s+(?:Hedera\s+)?wallet(?:\s+is|:)\s*(0\.0\.\d+|0x[a-fA-F0-9]{40})", re.IGNORECASE
)

NO_WALLET_MESSAGE = (
    "I need your connected wallet address to manage scheduled alerts for you — "
    "connect a wallet and try again."
)

SYSTEM_PROMPT = """You are the Scheduler Admin agent for ChainScope. Domain: setting up, listing, and canceling scheduled natural-language question alerts for the user's connected wallet ({owner_address}).

When the user asks to schedule an alert (e.g. "Set up daily alerts for USDC whale transactions at 9am", "run this question every day", "notify me daily about yield rates"):
1. Formulate a clear, self-contained re-runnable prompt string that captures what to check on each run (e.g. "What are the biggest USDC whale transactions in the last 24h, and how do they compare to recent activity?").
2. Determine the cron expression (default to daily 08:00 UTC "0 8 * * *" unless a specific time or cadence is named by the user).
3. Call `create_scheduled_query(name, prompt, cron_expression)`.

When the user asks to list their alerts or schedules (e.g. "What scheduled alerts do I have?"), call `list_scheduled_queries()`.

When the user asks to cancel an alert (e.g. "Cancel my daily USDC alert"), call `cancel_scheduled_query(query_id)`.

After calling a tool, confirm back to the user in one clear sentence what was performed (e.g. what query was scheduled and its schedule/frequency). Do NOT repeat raw cron syntax (like "0 8 * * *") verbatim to the user; describe the frequency in plain English (e.g. "every day at 8:00 AM UTC").
"""


def make_create_scheduled_query_tool(owner_address: str):
    @tool
    def create_scheduled_query(name: str, prompt: str, cron_expression: str = "0 8 * * *") -> str:
        """Schedules a natural language query to re-run periodically.

        Args:
            name: Short descriptive title for the scheduled query (e.g. "Daily USDC Whale Alert").
            prompt: Self-contained prompt string to execute on each run.
            cron_expression: Standard 5-part cron syntax (default "0 8 * * *").
        """
        try:
            validate_cron_expression(cron_expression)
        except ValueError as exc:
            return json.dumps({"status": "error", "message": str(exc)})

        query = save_query(
            owner_address=owner_address,
            name=name,
            prompt=prompt,
            cron_expression=cron_expression,
        )
        try:
            job_id = schedule_query_job(query_id=query["id"], cron_expression=cron_expression)
        except ValueError as exc:
            archive_query(query["id"])
            return json.dumps({"status": "error", "message": str(exc)})
        return json.dumps(
            {
                "status": "success",
                "query_id": query["id"],
                "name": name,
                "prompt": prompt,
                "cron_expression": cron_expression,
                "job_id": job_id,
            }
        )

    return create_scheduled_query


def make_list_scheduled_queries_tool(owner_address: str):
    @tool
    def list_scheduled_queries() -> str:
        """Lists all active scheduled queries for the user."""
        queries = get_user_queries(owner_address)
        return json.dumps({"status": "success", "count": len(queries), "queries": queries})

    return list_scheduled_queries


def make_cancel_scheduled_query_tool(owner_address: str):
    @tool
    def cancel_scheduled_query(query_id: int) -> str:
        """Cancels and archives a scheduled query by ID.

        Args:
            query_id: Numeric ID of the scheduled query to cancel.
        """
        job_id = f"query-{query_id}"
        remove_scheduled_job(job_id)
        archived = archive_query(query_id, owner_address)
        if archived:
            return json.dumps({"status": "success", "query_id": query_id, "action": "archived"})
        return json.dumps({"status": "error", "message": f"Query {query_id} not found."})

    return cancel_scheduled_query


async def scheduler_admin_node(state: GraphState) -> dict:
    match = CONNECTED_WALLET_RE.search(state["question"])
    if not match:
        return {
            "specialist_results": {"scheduler_admin": NO_WALLET_MESSAGE},
            "raw_data": {"scheduler_admin": []},
            "steps": [{"agent": LABEL, "text": "No connected wallet found in the request."}],
            "sources": [],
            "artifacts": [],
        }
    owner_address = match.group(1)

    tools = [
        make_create_scheduled_query_tool(owner_address),
        make_list_scheduled_queries_tool(owner_address),
        make_cancel_scheduled_query_tool(owner_address),
    ]

    return await run_specialist(
        state,
        key="scheduler_admin",
        label=LABEL,
        system_prompt=SYSTEM_PROMPT.format(owner_address=owner_address),
        tools=tools,
    )

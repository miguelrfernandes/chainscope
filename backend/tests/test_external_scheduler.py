"""Tests for serverless-mode scheduling.

On a host with no process between requests (Vercel), APScheduler can't fire
anything, so the schedule is a database fact (scheduled_queries.next_run_at)
and an external cron POSTs /api/scheduled-queries/tick. These cover that
path: due-ness, the tick endpoint's auth, and rescheduling after a run.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.scheduled_query_store import (
    get_due_queries,
    get_query_by_id,
    save_query,
    set_next_run_at,
)
from app.core.scheduler import (
    compute_next_run,
    is_external_mode,
    run_due_queries,
    schedule_query_job,
    shutdown_scheduler,
)
from app.main import app

CRON_SECRET = "test-cron-secret"


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


@pytest.fixture(autouse=True)
def _external_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEDULED_QUERY_DB_PATH", str(tmp_path / "scheduled_queries.db"))
    monkeypatch.setenv("SCHEDULER_DB_PATH", str(tmp_path / "scheduler.db"))
    monkeypatch.setenv("SCHEDULER_MODE", "external")
    monkeypatch.setenv("CRON_SECRET", CRON_SECRET)
    get_settings.cache_clear()
    yield
    shutdown_scheduler()
    get_settings.cache_clear()


def test_external_mode_detected_from_settings():
    assert is_external_mode() is True


def test_compute_next_run_is_in_the_future():
    next_run = compute_next_run("*/5 * * * *")
    assert next_run.endswith("Z")
    assert next_run > _iso(datetime.now(timezone.utc))


def test_scheduling_records_next_run_without_a_running_scheduler():
    """External mode must not need APScheduler to be alive to schedule."""
    query = save_query("0xabc", "Daily check", "How is my portfolio?", "0 8 * * *")

    schedule_query_job(query_id=query["id"], cron_expression="0 8 * * *")

    stored = get_query_by_id(query["id"])
    assert stored["next_run_at"] is not None
    assert stored["next_run_at"] > _iso(datetime.now(timezone.utc))


def test_only_past_due_active_queries_are_returned():
    past = save_query("0xabc", "past", "p", "0 8 * * *")
    future = save_query("0xabc", "future", "p", "0 8 * * *")
    set_next_run_at(past["id"], _iso(datetime.now(timezone.utc) - timedelta(minutes=1)))
    set_next_run_at(future["id"], _iso(datetime.now(timezone.utc) + timedelta(hours=1)))

    due_ids = [q["id"] for q in get_due_queries(_iso(datetime.now(timezone.utc)))]

    assert past["id"] in due_ids
    assert future["id"] not in due_ids


def test_queries_without_next_run_at_are_not_due():
    """Rows predating the column must not all fire at once on first tick."""
    legacy = save_query("0xabc", "legacy", "p", "0 8 * * *")
    set_next_run_at(legacy["id"], None)

    due_ids = [q["id"] for q in get_due_queries(_iso(datetime.now(timezone.utc)))]

    assert legacy["id"] not in due_ids


@pytest.mark.asyncio
async def test_run_due_queries_runs_and_reschedules():
    query = save_query("0xabc", "due", "p", "*/5 * * * *")
    set_next_run_at(query["id"], _iso(datetime.now(timezone.utc) - timedelta(minutes=1)))

    with patch("app.core.scheduler.run_scheduled_query", new_callable=AsyncMock) as mock_run:
        result = await run_due_queries()

    mock_run.assert_awaited_once_with(query["id"])
    assert result["ran"] == [query["id"]]

    # The same query must not stay due, or every tick would re-run it.
    rescheduled = get_query_by_id(query["id"])
    assert rescheduled["next_run_at"] > _iso(datetime.now(timezone.utc))


@pytest.mark.asyncio
async def test_failing_query_is_still_rescheduled():
    """One broken query must not wedge the tick into retrying it forever."""
    query = save_query("0xabc", "broken", "p", "*/5 * * * *")
    set_next_run_at(query["id"], _iso(datetime.now(timezone.utc) - timedelta(minutes=1)))

    with patch(
        "app.core.scheduler.run_scheduled_query",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        result = await run_due_queries()

    assert result["ran"] == []
    assert get_query_by_id(query["id"])["next_run_at"] > _iso(datetime.now(timezone.utc))


def _client():
    return TestClient(app)


def test_tick_rejects_missing_credentials():
    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with _client() as client:
            assert client.post("/api/scheduled-queries/tick").status_code == 401


def test_tick_rejects_wrong_secret():
    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with _client() as client:
            res = client.post(
                "/api/scheduled-queries/tick",
                headers={"Authorization": "Bearer not-the-secret"},
            )
            assert res.status_code == 401


def test_tick_refuses_to_run_when_no_secret_is_configured(monkeypatch):
    """An unauthenticated tick would let anyone drive the user's agent runs."""
    monkeypatch.delenv("CRON_SECRET", raising=False)
    get_settings.cache_clear()

    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with _client() as client:
            res = client.post(
                "/api/scheduled-queries/tick",
                headers={"Authorization": "Bearer anything"},
            )
            assert res.status_code == 503


def test_tick_runs_due_queries_with_valid_secret():
    query = save_query("0xabc", "due", "p", "*/5 * * * *")
    set_next_run_at(query["id"], _iso(datetime.now(timezone.utc) - timedelta(minutes=1)))

    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with patch("app.core.scheduler.run_scheduled_query", new_callable=AsyncMock) as mock_run:
            with _client() as client:
                res = client.post(
                    "/api/scheduled-queries/tick",
                    headers={"Authorization": f"Bearer {CRON_SECRET}"},
                )

    assert res.status_code == 200
    assert res.json()["ran"] == [query["id"]]
    mock_run.assert_awaited_once_with(query["id"])

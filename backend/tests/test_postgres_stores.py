"""Dialect-portability tests for the stores, run against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database, since
these need a live server:

    createdb chainscope_test
    TEST_DATABASE_URL=postgresql://localhost/chainscope_test uv run pytest tests/test_postgres_stores.py

They matter because the Vercel deployment runs entirely on this path —
managed_agents holds the encrypted keys to funded testnet accounts, so
"it worked on SQLite" is not evidence it works in production.
"""

import os
import re

import pytest

from app.core.config import get_settings

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set TEST_DATABASE_URL to a disposable Postgres database to run these",
)

ISO_8601 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


@pytest.fixture(autouse=True)
def _postgres_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL or "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _clean_tables(_postgres_settings):
    """Drop the tables between tests so each starts from a bare database.

    This also re-exercises the CREATE TABLE / ADD COLUMN path every time,
    which is where the dialect differences actually live.
    """
    import psycopg

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("DROP TABLE IF EXISTS scheduled_query_runs, scheduled_queries, managed_agents")
        conn.commit()
    yield


def test_targets_postgres_when_database_url_is_set():
    from app.core.db import is_postgres

    assert is_postgres() is True


def test_agent_round_trips_with_iso_timestamp():
    from app.core.agent_store import get_agent_by_name, save_agent

    save_agent("0xOWNER", "alpha", "0xevm1", "encrypted-1")
    agent = get_agent_by_name("0xowner", "alpha")

    assert agent is not None
    assert agent["encrypted_private_key"] == "encrypted-1"
    assert agent["evm_address"] == "0xevm1"  # ADD COLUMN IF NOT EXISTS migration
    # created_at must match SQLite's format or API responses differ by host.
    assert ISO_8601.match(agent["created_at"])


def test_upsert_replaces_key_material_without_duplicating():
    """ON CONFLICT ... excluded must behave identically to the SQLite path."""
    from app.core.agent_store import get_agent_by_name, get_user_agents, save_agent

    save_agent("0xowner", "alpha", "0xevm1", "encrypted-1")
    save_agent("0xowner", "alpha", "0xevm2", "encrypted-2")

    assert get_agent_by_name("0xowner", "alpha")["encrypted_private_key"] == "encrypted-2"
    assert len(get_user_agents("0xowner")) == 1


def test_agent_status_transitions():
    from app.core.agent_store import (
        archive_agent,
        get_agent_by_name,
        save_agent,
        set_agent_account_and_status,
    )

    save_agent("0xowner", "alpha", "0xevm1", "encrypted-1")

    assert set_agent_account_and_status("0xowner", "alpha", "0.0.5", "ACTIVE") is True
    assert get_agent_by_name("0xowner", "alpha")["account_id"] == "0.0.5"
    assert archive_agent("0xowner", "alpha") is True
    assert archive_agent("0xowner", "alpha") is False


def test_insert_returns_id_and_next_run_at_drives_due_ness():
    """RETURNING id stands in for SQLite's cursor.lastrowid."""
    from app.core.scheduled_query_store import get_due_queries, save_query, set_next_run_at

    query = save_query("0xowner", "daily", "how are things?", "0 8 * * *", next_run_at="2000-01-01T00:00:00.000Z")

    assert isinstance(query["id"], int)
    assert query["id"] in [q["id"] for q in get_due_queries("2020-01-01T00:00:00.000Z")]

    set_next_run_at(query["id"], "2999-01-01T00:00:00.000Z")
    assert query["id"] not in [q["id"] for q in get_due_queries("2020-01-01T00:00:00.000Z")]


def test_runs_and_inbox_round_trip():
    from app.core.scheduled_query_store import (
        get_runs_for_query,
        get_unread_runs,
        mark_run_read,
        save_query,
        save_run,
    )

    query = save_query("0xowner", "daily", "p", "0 8 * * *")
    run = save_run(query["id"], "the answer", [{"id": "src", "query": "q"}])

    assert isinstance(run["id"], int)
    assert run["sources"][0]["id"] == "src"
    assert ISO_8601.match(run["run_at"])
    assert len(get_runs_for_query(query["id"], "0xowner")) == 1
    assert len(get_unread_runs("0xowner")) == 1

    assert mark_run_read(run["id"], "0xowner") is True
    assert get_unread_runs("0xowner") == []

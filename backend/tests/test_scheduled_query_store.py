import pytest

from app.core.config import get_settings
from app.core.scheduled_query_store import (
    archive_query,
    get_query_by_id,
    get_runs_for_query,
    get_unread_runs,
    get_user_queries,
    mark_run_read,
    save_query,
    save_run,
)


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEDULED_QUERY_DB_PATH", str(tmp_path / "scheduled_queries.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_save_and_get_scheduled_queries():
    owner = "0x1234567890123456789012345678901234567890"
    q1 = save_query(owner, "USDC Whale Alert", "What are the biggest USDC whale txs?", "0 8 * * *")
    assert q1["id"] is not None
    assert q1["owner_address"] == owner.lower()
    assert q1["name"] == "USDC Whale Alert"
    assert q1["status"] == "ACTIVE"

    queries = get_user_queries(owner)
    assert len(queries) == 1
    assert queries[0]["id"] == q1["id"]

    fetched = get_query_by_id(q1["id"])
    assert fetched is not None
    assert fetched["name"] == "USDC Whale Alert"


def test_archive_scheduled_query():
    owner = "0x1234567890123456789012345678901234567890"
    q = save_query(owner, "Daily Yield Alert", "Check yield rates", "0 9 * * *")
    assert archive_query(q["id"], owner) is True
    assert len(get_user_queries(owner)) == 0

    fetched = get_query_by_id(q["id"])
    assert fetched["status"] == "ARCHIVED"


def test_save_and_read_runs():
    owner = "0x1234567890123456789012345678901234567890"
    q = save_query(owner, "USDC Whale Alert", "What are the biggest USDC whale txs?", "0 8 * * *")

    r1 = save_run(q["id"], "Found 2 whale transfers total $5M.", [{"label": "defi_research"}])
    assert r1["id"] is not None
    assert r1["is_read"] == 0
    assert r1["sources"] == [{"label": "defi_research"}]

    unread = get_unread_runs(owner)
    assert len(unread) == 1
    assert unread[0]["id"] == r1["id"]

    runs = get_runs_for_query(q["id"], owner)
    assert len(runs) == 1

    assert mark_run_read(r1["id"], owner) is True
    assert len(get_unread_runs(owner)) == 0

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.scheduled_query_store import save_query
from app.core.scheduler import run_scheduled_query, shutdown_scheduler
from app.main import app


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEDULED_QUERY_DB_PATH", str(tmp_path / "scheduled_queries.db"))
    monkeypatch.setenv("SCHEDULER_DB_PATH", str(tmp_path / "scheduler.db"))
    get_settings.cache_clear()
    yield
    shutdown_scheduler()
    get_settings.cache_clear()


def test_create_list_delete_scheduled_query():
    owner = "0x1234567890123456789012345678901234567890"

    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with TestClient(app) as client:
            # Create
            res = client.post(
                "/api/scheduled-queries",
                json={
                    "owner_address": owner,
                    "name": "USDC Whale Watch",
                    "prompt": "Track top USDC transfers > $100k",
                    "cron_expression": "0 8 * * *",
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert data["name"] == "USDC Whale Watch"
            query_id = data["id"]

            # List
            res_list = client.get(f"/api/scheduled-queries?owner_address={owner}")
            assert res_list.status_code == 200
            queries = res_list.json()
            assert len(queries) == 1
            assert queries[0]["id"] == query_id

            # Inbox summary
            res_inbox = client.get(f"/api/inbox?owner_address={owner}")
            assert res_inbox.status_code == 200
            assert res_inbox.json()["unread_count"] == 0

            # Delete
            res_del = client.delete(f"/api/scheduled-queries/{query_id}?owner_address={owner}")
            assert res_del.status_code == 200
            assert res_del.json()["status"] == "success"

            # List again
            res_list2 = client.get(f"/api/scheduled-queries?owner_address={owner}")
            assert len(res_list2.json()) == 0


@pytest.mark.asyncio
async def test_run_scheduled_query():
    owner = "0x1234567890123456789012345678901234567890"
    query = save_query(owner, "USDC Alert", "Check USDC whale moves", "0 8 * * *")

    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = {
        "final_answer": "Whale moved 1,000,000 USDC.",
        "sources": [{"label": "defi_research"}],
    }

    with patch("app.api.chat.get_graph", return_value=mock_graph):
        res = await run_scheduled_query(query["id"])
        assert res["query_id"] == query["id"]

    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with TestClient(app) as client:
            runs_res = client.get(
                f"/api/scheduled-queries/{query['id']}/runs?owner_address={owner}"
            )
            assert runs_res.status_code == 200
            runs = runs_res.json()
            assert len(runs) == 1
            assert runs[0]["answer"] == "Whale moved 1,000,000 USDC."
            assert runs[0]["is_read"] == 0

            # Mark read
            run_id = runs[0]["id"]
            read_res = client.post(
                f"/api/scheduled-queries/runs/{run_id}/read?owner_address={owner}"
            )
            assert read_res.status_code == 200
            assert read_res.json()["is_read"] == 1

            inbox_res = client.get(f"/api/inbox?owner_address={owner}")
            assert inbox_res.json()["unread_count"] == 0

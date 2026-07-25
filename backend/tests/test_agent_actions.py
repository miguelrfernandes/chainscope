from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.agent_actions import router as agent_actions_router
from app.core.agent_store import get_agent_by_name, save_agent
from app.core.config import get_settings

EVM_ADDRESS = "0xb081bd3b7845046d3019128968144ca13a13bcd2"[:42]


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(agent_actions_router)
    return TestClient(app)


def test_confirm_agent_activates_on_successful_transaction(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with (
        patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx,
        patch(
            "app.api.agent_actions.get_account_by_address_or_id", new_callable=AsyncMock
        ) as mock_get_account,
    ):
        mock_get_tx.return_value = {"transactions": [{"result": "SUCCESS", "transfers": []}]}
        mock_get_account.return_value = {"account": "0.0.1001", "balance": {"balance": 100_000_000}}
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ACTIVE"
    assert body["agent"]["status"] == "ACTIVE"
    assert body["agent"]["account_id"] == "0.0.1001"
    assert "encrypted_private_key" not in body["agent"]
    mock_get_tx.assert_called_once_with("0.0.1001@1699999999.123456789")
    mock_get_account.assert_called_once_with(EVM_ADDRESS)
    stored = get_agent_by_name("0xowner", "yield-bot")
    assert stored["status"] == "ACTIVE"
    assert stored["account_id"] == "0.0.1001"


def test_confirm_agent_rejects_underfunded_account(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with (
        patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx,
        patch(
            "app.api.agent_actions.get_account_by_address_or_id", new_callable=AsyncMock
        ) as mock_get_account,
    ):
        mock_get_tx.return_value = {"transactions": [{"result": "SUCCESS", "transfers": []}]}
        # A real, successful transaction — but the agent's account doesn't
        # (yet) hold the full 1 HBAR seed amount.
        mock_get_account.return_value = {"account": "0.0.1001", "balance": {"balance": 1000}}
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 400
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_rejects_failed_transaction(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with patch(
        "app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock
    ) as mock_get_tx:
        mock_get_tx.return_value = {"transactions": [{"result": "INSUFFICIENT_PAYER_BALANCE"}]}
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 400
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_rejects_unknown_transaction(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with patch(
        "app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock
    ) as mock_get_tx:
        mock_get_tx.return_value = {"transactions": []}
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 400


def test_confirm_agent_returns_404_for_unknown_agent(client):
    with patch(
        "app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock
    ) as mock_get_tx:
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "nope",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 404
    mock_get_tx.assert_not_called()


def test_confirm_agent_returns_502_on_mirror_node_error(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with patch(
        "app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock
    ) as mock_get_tx:
        import httpx

        mock_get_tx.side_effect = httpx.ConnectError("boom")
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 502
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_returns_400_when_account_not_found_yet(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with (
        patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx,
        patch(
            "app.api.agent_actions.get_account_by_address_or_id", new_callable=AsyncMock
        ) as mock_get_account,
    ):
        import httpx

        mock_get_tx.return_value = {"transactions": [{"result": "SUCCESS", "transfers": []}]}
        mock_get_account.side_effect = httpx.HTTPStatusError("404", request=None, response=None)
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0.0.1001@1699999999.123456789",
            },
        )

    assert response.status_code == 400
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_activates_on_evm_transaction_hash(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with (
        patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx,
        patch(
            "app.api.agent_actions.get_account_by_address_or_id", new_callable=AsyncMock
        ) as mock_get_account,
    ):
        mock_get_tx.return_value = {"transactions": [{"result": "SUCCESS"}]}
        mock_get_account.return_value = {"account": "0.0.78492", "balance": {"balance": 100_000_000}}
        response = client.post(
            "/api/actions/confirm-agent",
            json={
                "owner_address": "0xowner",
                "agent_name": "yield-bot",
                "tx_id": "0xb5096553fb09ab11abb9819cac9b1721cee3dec5d58c1ed662cce7f356a0f0c5",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ACTIVE"
    assert body["agent"]["status"] == "ACTIVE"
    assert body["agent"]["account_id"] == "0.0.78492"
    stored = get_agent_by_name("0xowner", "yield-bot")
    assert stored["status"] == "ACTIVE"
    assert stored["account_id"] == "0.0.78492"


def test_list_agents_returns_user_agents_with_balances(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    with patch("app.api.agent_actions.get_account_by_address_or_id", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"balance": {"balance": 250_000_000}}
        res = client.get("/api/agents?owner_address=0xowner")

    assert res.status_code == 200
    agents = res.json()
    assert len(agents) == 1
    assert agents[0]["agent_name"] == "yield-bot"
    assert agents[0]["evm_address"] == EVM_ADDRESS
    assert agents[0]["balance_hbar"] == 2.5
    assert "encrypted_private_key" not in agents[0]


def test_scheduled_jobs_endpoints(client):
    from app.core.scheduler import schedule_rebalance_job

    job_id = schedule_rebalance_job("0xowner", "yield-bot", "0 0 * * *", "test-job-42")

    res_get = client.get("/api/scheduler/jobs")
    assert res_get.status_code == 200
    jobs = res_get.json()
    assert any(j["job_id"] == job_id for j in jobs)

    res_del = client.delete(f"/api/scheduler/jobs/{job_id}")
    assert res_del.status_code == 200
    assert res_del.json()["job_id"] == job_id

    res_del_404 = client.delete(f"/api/scheduler/jobs/{job_id}")
    assert res_del_404.status_code == 404


def test_delete_agent_endpoint(client):
    save_agent("0xowner", "yield-bot", EVM_ADDRESS, "enc-key-1")

    res_del = client.delete("/api/agents/yield-bot?owner_address=0xowner")
    assert res_del.status_code == 200
    assert res_del.json()["status"] == "success"

    res_del_404 = client.delete("/api/agents/yield-bot?owner_address=0xowner")
    assert res_del_404.status_code == 404



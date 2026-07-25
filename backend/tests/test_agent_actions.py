from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.agent_actions import router as agent_actions_router
from app.core.agent_store import get_agent_by_name, save_agent
from app.core.config import get_settings


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
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        mock_get_tx.return_value = {
            "transactions": [
                {
                    "result": "SUCCESS",
                    "transfers": [
                        {"account": "0.0.9999", "amount": -100_100_000},
                        {"account": "0.0.1001", "amount": 100_000_000},
                    ],
                }
            ]
        }
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "yield-bot", "tx_id": "0.0.1001@1699999999.123456789"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ACTIVE"
    assert body["agent"]["status"] == "ACTIVE"
    assert "encrypted_private_key" not in body["agent"]
    mock_get_tx.assert_called_once_with("0.0.1001@1699999999.123456789")
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "ACTIVE"


def test_confirm_agent_rejects_transaction_not_funding_this_agent(client):
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        # A real, successful transaction — just not one that credits this
        # agent's account with the seed amount.
        mock_get_tx.return_value = {
            "transactions": [
                {
                    "result": "SUCCESS",
                    "transfers": [
                        {"account": "0.0.9999", "amount": -1000},
                        {"account": "0.0.8888", "amount": 1000},
                    ],
                }
            ]
        }
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "yield-bot", "tx_id": "0.0.8888@1699999999.123456789"},
        )

    assert response.status_code == 400
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_rejects_failed_transaction(client):
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        mock_get_tx.return_value = {"transactions": [{"result": "INSUFFICIENT_PAYER_BALANCE"}]}
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "yield-bot", "tx_id": "0.0.1001@1699999999.123456789"},
        )

    assert response.status_code == 400
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"


def test_confirm_agent_rejects_unknown_transaction(client):
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        mock_get_tx.return_value = {"transactions": []}
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "yield-bot", "tx_id": "0.0.1001@1699999999.123456789"},
        )

    assert response.status_code == 400


def test_confirm_agent_returns_404_for_unknown_agent(client):
    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "nope", "tx_id": "0.0.1001@1699999999.123456789"},
        )

    assert response.status_code == 404
    mock_get_tx.assert_not_called()


def test_confirm_agent_returns_502_on_mirror_node_error(client):
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    with patch("app.api.agent_actions.get_transaction_by_id", new_callable=AsyncMock) as mock_get_tx:
        import httpx

        mock_get_tx.side_effect = httpx.ConnectError("boom")
        response = client.post(
            "/api/actions/confirm-agent",
            json={"owner_address": "0xowner", "agent_name": "yield-bot", "tx_id": "0.0.1001@1699999999.123456789"},
        )

    assert response.status_code == 502
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "PENDING"

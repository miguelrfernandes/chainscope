import pytest

from app.core.agent_store import (
    get_agent_by_name,
    get_user_agents,
    save_agent,
    set_agent_account_and_status,
    set_agent_status,
)
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_save_and_get_agent_by_name():
    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")

    agent = get_agent_by_name("0xowner", "yield-bot")

    # No Hedera account exists yet at provisioning time — account_id starts
    # empty and is only filled in once seed funding auto-creates it.
    assert agent["account_id"] == ""
    assert agent["evm_address"] == "0xevm1"
    assert agent["encrypted_private_key"] == "enc-key-1"
    assert agent["status"] == "PENDING"
    assert agent["created_at"]


def test_get_agent_by_name_missing_returns_none():
    assert get_agent_by_name("0xowner", "nope") is None


def test_save_agent_upserts_on_owner_and_name():
    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")
    save_agent("0xowner", "yield-bot", "0xevm2", "enc-key-2")

    agent = get_agent_by_name("0xowner", "yield-bot")

    assert agent["evm_address"] == "0xevm2"
    assert agent["encrypted_private_key"] == "enc-key-2"
    assert len(get_user_agents("0xowner")) == 1


def test_get_user_agents_scoped_to_owner():
    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")
    save_agent("0xowner", "risk-bot", "0xevm2", "enc-key-2")
    save_agent("0xother", "yield-bot", "0xevm3", "enc-key-3")

    agents = get_user_agents("0xowner")

    assert {a["agent_name"] for a in agents} == {"yield-bot", "risk-bot"}
    assert get_user_agents("0xnobody") == []


def test_set_agent_status_updates_lifecycle():
    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")

    assert set_agent_status("0xowner", "yield-bot", "ACTIVE") is True
    assert get_agent_by_name("0xowner", "yield-bot")["status"] == "ACTIVE"
    assert set_agent_status("0xowner", "nope", "ACTIVE") is False


def test_set_agent_account_and_status_resolves_account_id():
    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")

    assert set_agent_account_and_status("0xowner", "yield-bot", "0.0.99999", "ACTIVE") is True

    agent = get_agent_by_name("0xowner", "yield-bot")
    assert agent["account_id"] == "0.0.99999"
    assert agent["status"] == "ACTIVE"


def test_delete_agent():
    from app.core.agent_store import delete_agent

    save_agent("0xowner", "yield-bot", "0xevm1", "enc-key-1")
    assert delete_agent("0xowner", "yield-bot") is True
    assert get_agent_by_name("0xowner", "yield-bot") is None
    assert delete_agent("0xowner", "yield-bot") is False


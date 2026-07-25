import pytest

from app.core.agent_store import get_agent_by_name, get_user_agents, save_agent
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_save_and_get_agent_by_name():
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")

    agent = get_agent_by_name("0xowner", "yield-bot")

    assert agent["account_id"] == "0.0.1001"
    assert agent["encrypted_private_key"] == "enc-key-1"
    assert agent["created_at"]


def test_get_agent_by_name_missing_returns_none():
    assert get_agent_by_name("0xowner", "nope") is None


def test_save_agent_upserts_on_owner_and_name():
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")
    save_agent("0xowner", "yield-bot", "0.0.2002", "enc-key-2")

    agent = get_agent_by_name("0xowner", "yield-bot")

    assert agent["account_id"] == "0.0.2002"
    assert agent["encrypted_private_key"] == "enc-key-2"
    assert len(get_user_agents("0xowner")) == 1


def test_get_user_agents_scoped_to_owner():
    save_agent("0xowner", "yield-bot", "0.0.1001", "enc-key-1")
    save_agent("0xowner", "risk-bot", "0.0.1002", "enc-key-2")
    save_agent("0xother", "yield-bot", "0.0.1003", "enc-key-3")

    agents = get_user_agents("0xowner")

    assert {a["agent_name"] for a in agents} == {"yield-bot", "risk-bot"}
    assert get_user_agents("0xnobody") == []

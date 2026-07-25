import asyncio

import pytest

from app.core.config import get_settings
from app.tools.hedera_actions import get_hedera_action_tools, get_hedera_return_bytes_tools


@pytest.fixture(autouse=True)
def _clear_tool_cache():
    get_hedera_action_tools.cache_clear()
    get_hedera_return_bytes_tools.cache_clear()
    yield
    get_hedera_action_tools.cache_clear()
    get_hedera_return_bytes_tools.cache_clear()


def test_get_hedera_action_tools_requires_operator_credentials(monkeypatch):
    monkeypatch.delenv("HEDERA_OPERATOR_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("HEDERA_OPERATOR_PRIVATE_KEY", raising=False)
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="HEDERA_OPERATOR_ACCOUNT_ID"):
        get_hedera_action_tools()

    get_settings.cache_clear()


def test_get_hedera_action_tools_builds_curated_tool_set(monkeypatch):
    monkeypatch.setenv("HEDERA_OPERATOR_ACCOUNT_ID", "0.0.2")
    # A syntactically valid (not real/funded) ED25519 testnet private key.
    monkeypatch.setenv(
        "HEDERA_OPERATOR_PRIVATE_KEY",
        "302e020100300506032b657004220420"
        + "00" * 32,
    )
    get_settings.cache_clear()

    tools = get_hedera_action_tools()
    names = {t.name for t in tools}
    assert names == {
        "transfer_hbar_tool",
        "create_topic_tool",
        "submit_topic_message_tool",
        "create_fungible_token_tool",
        "mint_fungible_token_tool",
        "associate_token_tool",
    }

    get_settings.cache_clear()


def test_get_hedera_return_bytes_tools_needs_no_operator_credentials(monkeypatch):
    # No HEDERA_OPERATOR_* set at all — RETURN_BYTES mode must not require them.
    monkeypatch.delenv("HEDERA_OPERATOR_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("HEDERA_OPERATOR_PRIVATE_KEY", raising=False)
    get_settings.cache_clear()

    tools = get_hedera_return_bytes_tools("0.0.7890")
    names = {t.name for t in tools}
    assert "transfer_hbar_tool" in names

    get_settings.cache_clear()


def test_get_hedera_return_bytes_tools_builds_unsigned_bytes_for_user_account():
    tool = {t.name: t for t in get_hedera_return_bytes_tools("0.0.7890")}["transfer_hbar_tool"]

    result = asyncio.run(
        tool.ainvoke({"transfers": [{"account_id": "0.0.1001", "amount": 1.0}]})
    )

    assert '"type": "return_bytes"' in result
    assert '"bytes_data"' in result
    assert "error" not in result or '"error": null' in result

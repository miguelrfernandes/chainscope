import json
from unittest.mock import MagicMock, patch

import pytest
from hiero_sdk_python import AccountId, PrivateKey

from app.core.config import get_settings
from app.tools.hedera_provisioner import (
    Vault,
    create_account_on_hedera,
    decrypt_private_key,
    encrypt_private_key,
    get_hedera_agent,
    list_hedera_agents,
    make_provision_hedera_agent_tool,
    provision_hedera_agent,
)


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_encryption_decryption_roundtrip():
    raw_key = PrivateKey.generate_ed25519().to_string_der()
    secret = "test-secret-vault-key-32b"

    encrypted = encrypt_private_key(raw_key, secret_key=secret)
    assert ":" in encrypted

    decrypted = decrypt_private_key(encrypted, secret_key=secret)
    assert decrypted == raw_key


def test_make_provision_hedera_agent_tool_binding():
    owner = "0x1111222233334444555566667777888899990000"
    tool = make_provision_hedera_agent_tool(owner)

    # Tool args schema must only take name, not owner_wallet_address
    assert set(tool.args.keys()) == {"name"}

    result_str = tool.invoke({"name": "BoundAgent"})
    payload = json.loads(result_str)
    assert payload["name"] == "BoundAgent"

    stored = Vault.get_agent(owner, "BoundAgent")
    assert stored is not None
    assert stored["account_id"] == payload["account_id"]




def test_provision_hedera_agent_tool_execution():
    result_str = provision_hedera_agent.invoke(
        {"name": "YieldSentinel", "owner_wallet_address": "0x1234567890123456789012345678901234567890"}
    )

    payload = json.loads(result_str)
    assert payload["status"] == "success"
    assert payload["name"] == "YieldSentinel"
    assert payload["account_id"].startswith("0.0.")
    assert payload["evm_address"].startswith("0x")
    assert payload["vault_registered"] is True
    assert "public_key" in payload

    # Verify initial seed funding action payload (1 HBAR)
    action = payload["action"]
    assert action["type"] == "action/seed-agent-hbar"
    assert action["id"] == "seed-agent-hbar"
    assert "YieldSentinel" in action["label"]
    assert action["value"] == "1 HBAR"
    assert action["amount_hbar"] == 1.0
    assert action["recipient_account_id"] == payload["account_id"]


def test_vault_registration_and_retrieval():
    owner = "0x9876543210987654321098765432109876543210"
    result_str = provision_hedera_agent.invoke(
        {"name": "RiskBot", "owner_wallet_address": owner}
    )
    payload = json.loads(result_str)

    stored_agent = Vault.get_agent(owner, "RiskBot")
    assert stored_agent is not None
    assert stored_agent["account_id"] == payload["account_id"]
    assert stored_agent["encrypted_private_key"] is not None

    # Verify we can decrypt the stored private key
    decrypted_key = decrypt_private_key(stored_agent["encrypted_private_key"])
    assert decrypted_key is not None
    assert len(decrypted_key) > 0


def test_create_account_on_hedera_with_operator_credentials(monkeypatch):
    monkeypatch.setenv("HEDERA_OPERATOR_ACCOUNT_ID", "0.0.2")
    dummy_key = PrivateKey.generate_ed25519().to_string_der()
    monkeypatch.setenv("HEDERA_OPERATOR_PRIVATE_KEY", dummy_key)
    get_settings.cache_clear()

    pub_key = PrivateKey.generate_ed25519().public_key()

    mock_client = MagicMock()
    mock_tx = MagicMock()
    mock_resp = MagicMock()
    mock_receipt = MagicMock()
    mock_receipt.account_id = AccountId.from_string("0.0.99999")
    mock_resp.get_receipt.return_value = mock_receipt
    mock_tx.execute.return_value = mock_resp

    with patch("app.tools.hedera_provisioner.Client", return_value=mock_client), patch(
        "app.tools.hedera_provisioner.AccountCreateTransaction", return_value=mock_tx
    ):
        acc_id, evm = create_account_on_hedera(pub_key, "TestOperatorAgent")
        assert acc_id == "0.0.99999"
        assert evm == "0x000000000000000000000000000000000001869f"

    get_settings.cache_clear()


def test_list_hedera_agents_tool_execution():
    owner = "0xowner_for_listing"
    provision_hedera_agent.invoke({"name": "AgentA", "owner_wallet_address": owner})
    provision_hedera_agent.invoke({"name": "AgentB", "owner_wallet_address": owner})

    res_str = list_hedera_agents.invoke({"owner_wallet_address": owner})
    data = json.loads(res_str)
    assert data["status"] == "success"
    assert data["count"] == 2
    names = [a["agent_name"] for a in data["agents"]]
    assert "AgentA" in names
    assert "AgentB" in names


def test_get_hedera_agent_tool_execution():
    owner = "0xowner_for_get_agent"
    prov_res = json.loads(provision_hedera_agent.invoke({"name": "YieldSentinel", "owner_wallet_address": owner}))

    get_res = json.loads(get_hedera_agent.invoke({"name": "YieldSentinel", "owner_wallet_address": owner}))
    assert get_res["status"] == "success"
    assert get_res["name"] == "YieldSentinel"
    assert get_res["account_id"] == prov_res["account_id"]
    assert get_res["evm_address"] == prov_res["evm_address"]

    not_found_res = json.loads(get_hedera_agent.invoke({"name": "UnknownAgent", "owner_wallet_address": owner}))
    assert not_found_res["status"] == "error"
    assert "not found" in not_found_res["message"]



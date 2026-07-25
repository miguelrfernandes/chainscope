import json

import pytest
from hiero_sdk_python import PrivateKey

from app.core.config import get_settings
from app.tools.hedera_provisioner import (
    Vault,
    decrypt_private_key,
    derive_evm_address,
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
    raw_key = PrivateKey.generate_ecdsa().to_string_der()
    secret = "test-secret-vault-key-32b"

    encrypted = encrypt_private_key(raw_key, secret_key=secret)
    assert ":" in encrypted

    decrypted = decrypt_private_key(encrypted, secret_key=secret)
    assert decrypted == raw_key


def test_derive_evm_address_matches_public_key_to_evm_address():
    public_key = PrivateKey.generate_ecdsa().public_key()
    expected = f"0x{public_key.to_evm_address().to_string()}"
    assert derive_evm_address(public_key) == expected


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
    # No Hedera account exists yet at provisioning time — only the key/EVM
    # address does. account_id is filled in later by confirm-agent.
    assert stored["account_id"] == ""
    assert payload["account_id"] is None
    assert stored["evm_address"] == payload["evm_address"]


def test_provision_hedera_agent_tool_execution():
    result_str = provision_hedera_agent.invoke(
        {
            "name": "YieldSentinel",
            "owner_wallet_address": "0x1234567890123456789012345678901234567890",
        }
    )

    payload = json.loads(result_str)
    assert payload["status"] == "success"
    assert payload["name"] == "YieldSentinel"
    assert payload["account_id"] is None
    assert payload["evm_address"].startswith("0x")
    assert len(payload["evm_address"]) == 42
    assert payload["vault_registered"] is True
    assert "public_key" in payload

    # Verify initial seed funding action payload (1 HBAR)
    action = payload["action"]
    assert action["type"] == "action/seed-agent-hbar"
    assert action["id"] == "seed-agent-hbar"
    assert "YieldSentinel" in action["label"]
    assert action["value"] == "1 HBAR"
    assert action["amount_hbar"] == 1.0
    assert action["recipient_account_id"] == payload["evm_address"]


def test_vault_registration_and_retrieval():
    owner = "0x9876543210987654321098765432109876543210"
    result_str = provision_hedera_agent.invoke({"name": "RiskBot", "owner_wallet_address": owner})
    payload = json.loads(result_str)

    stored_agent = Vault.get_agent(owner, "RiskBot")
    assert stored_agent is not None
    assert stored_agent["evm_address"] == payload["evm_address"]
    assert stored_agent["encrypted_private_key"] is not None

    # Verify we can decrypt the stored private key
    decrypted_key = decrypt_private_key(stored_agent["encrypted_private_key"])
    assert decrypted_key is not None
    assert len(decrypted_key) > 0


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
    prov_res = json.loads(
        provision_hedera_agent.invoke({"name": "YieldSentinel", "owner_wallet_address": owner})
    )

    get_res = json.loads(
        get_hedera_agent.invoke({"name": "YieldSentinel", "owner_wallet_address": owner})
    )
    assert get_res["status"] == "success"
    assert get_res["name"] == "YieldSentinel"
    assert get_res["account_id"] is None
    assert get_res["evm_address"] == prov_res["evm_address"]

    not_found_res = json.loads(
        get_hedera_agent.invoke({"name": "UnknownAgent", "owner_wallet_address": owner})
    )
    assert not_found_res["status"] == "error"
    assert "not found" in not_found_res["message"]

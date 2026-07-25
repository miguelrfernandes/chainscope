import pytest

from app.agents.specialists.hedera_wallet_action import NO_WALLET_MESSAGE, hedera_wallet_action_node


@pytest.mark.asyncio
async def test_hedera_wallet_action_requires_connected_wallet():
    state = {"question": "Send 1 HBAR to 0.0.1234"}
    result = await hedera_wallet_action_node(state)
    assert result["specialist_results"]["hedera_wallet_action"] == NO_WALLET_MESSAGE
    assert result["artifacts"] == []


@pytest.mark.asyncio
async def test_hedera_wallet_action_extracts_connected_account(monkeypatch):
    captured = {}

    async def fake_run_specialist(state, *, key, label, system_prompt, tools, action_artifact_types=None):
        captured["system_prompt"] = system_prompt
        captured["tools"] = tools
        captured["tool_names"] = {t.name for t in tools}
        captured["action_artifact_types"] = action_artifact_types
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr(
        "app.agents.specialists.hedera_wallet_action.run_specialist", fake_run_specialist
    )

    state = {"question": "Send 1 HBAR to 0.0.1234 (Connected Hedera wallet: 0.0.7890)"}
    await hedera_wallet_action_node(state)

    assert "0.0.7890" in captured["system_prompt"]
    assert "transfer_hbar_tool" in captured["tool_names"]
    assert "provision_hedera_agent" in captured["tool_names"]
    assert captured["action_artifact_types"]["transfer_hbar_tool"] == "action/hedera-tx-bytes"

    # Single Hedera tag means EVM owner defaults to 0xdefault_owner
    prov_tool = [t for t in captured["tools"] if t.name == "provision_hedera_agent"][0]
    assert set(prov_tool.args.keys()) == {"name"}


@pytest.mark.asyncio
async def test_hedera_wallet_action_extracts_both_wallet_tags(monkeypatch):
    captured = {}

    async def fake_run_specialist(state, *, key, label, system_prompt, tools, action_artifact_types=None):
        captured["system_prompt"] = system_prompt
        captured["tools"] = tools
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr(
        "app.agents.specialists.hedera_wallet_action.run_specialist", fake_run_specialist
    )

    evm_owner = "0x1234567890123456789012345678901234567890"
    state = {
        "question": f"Create agent YieldSentinel (Connected wallet: {evm_owner})\n(Connected Hedera wallet: 0.0.7890)"
    }
    await hedera_wallet_action_node(state)

    assert "0.0.7890" in captured["system_prompt"]

    import json
    prov_tool = [t for t in captured["tools"] if t.name == "provision_hedera_agent"][0]
    assert set(prov_tool.args.keys()) == {"name"}

    result = json.loads(prov_tool.invoke({"name": "YieldSentinel"}))
    from app.tools.hedera_provisioner import Vault
    stored = Vault.get_agent(evm_owner, "YieldSentinel")
    assert stored is not None
    assert stored["account_id"] == result["account_id"]


@pytest.mark.asyncio
async def test_hedera_wallet_action_resolves_evm_account(monkeypatch):
    captured = {}

    async def fake_run_specialist(state, *, key, label, system_prompt, tools, action_artifact_types=None):
        captured["system_prompt"] = system_prompt
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    async def fake_get(path, params=None):
        return {"account": "0.0.9999"}

    monkeypatch.setattr(
        "app.agents.specialists.hedera_wallet_action.run_specialist", fake_run_specialist
    )
    monkeypatch.setattr(
        "app.tools.hedera_mirror._get", fake_get
    )

    state = {"question": "Send 1 HBAR to 0.0.1234 (Connected Hedera wallet: 0x67e6bb3400da3af23f1b54623ff5972494b8e132)"}
    await hedera_wallet_action_node(state)

    assert "0.0.9999" in captured["system_prompt"]



import pytest

from app.agents.specialists.saucerswap import NO_EVM_WALLET_MESSAGE, saucerswap_node


@pytest.mark.asyncio
async def test_saucerswap_requires_wallet_for_swap():
    state = {"question": "Swap 10 SAUCE for WHBAR on SaucerSwap"}
    result = await saucerswap_node(state)
    assert result["specialist_results"]["saucerswap"] == NO_EVM_WALLET_MESSAGE
    assert result["artifacts"] == []


@pytest.mark.asyncio
async def test_saucerswap_apr_question_needs_no_wallet(monkeypatch):
    captured = {}

    async def fake_run_specialist(
        state, *, key, label, system_prompt, tools, action_artifact_types=None
    ):
        captured["tool_names"] = {t.name for t in tools}
        captured["action_artifact_types"] = action_artifact_types
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr("app.agents.specialists.saucerswap.run_specialist", fake_run_specialist)

    state = {"question": "What's the best APR on SaucerSwap right now?"}
    result = await saucerswap_node(state)

    assert result["specialist_results"]["saucerswap"] == "ok"
    assert "get_saucerswap_pool_aprs" in captured["tool_names"]
    assert (
        captured["action_artifact_types"]["build_saucerswap_swap_tx"]
        == "action/hedera-evm-tx-batch"
    )


@pytest.mark.asyncio
async def test_saucerswap_swap_with_wallet(monkeypatch):
    captured = {}

    async def fake_run_specialist(
        state, *, key, label, system_prompt, tools, action_artifact_types=None
    ):
        captured["system_prompt"] = system_prompt
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr("app.agents.specialists.saucerswap.run_specialist", fake_run_specialist)

    evm_owner = "0x1234567890123456789012345678901234567890"
    state = {"question": f"Swap 10 SAUCE for WHBAR on SaucerSwap (Connected wallet: {evm_owner})"}
    await saucerswap_node(state)

    assert evm_owner in captured["system_prompt"]

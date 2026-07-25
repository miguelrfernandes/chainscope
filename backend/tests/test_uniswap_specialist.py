import pytest

from app.agents.specialists.uniswap import NO_EVM_WALLET_MESSAGE, uniswap_node


@pytest.mark.asyncio
async def test_uniswap_requires_wallet_for_swap():
    state = {"question": "Swap 1 ETH for USDC on Uniswap"}
    result = await uniswap_node(state)
    assert result["specialist_results"]["uniswap"] == NO_EVM_WALLET_MESSAGE
    assert result["artifacts"] == []


@pytest.mark.asyncio
async def test_uniswap_quote_question_needs_no_wallet(monkeypatch):
    captured = {}

    async def fake_run_specialist(state, *, key, label, system_prompt, tools, action_artifact_types=None):
        captured["tool_names"] = {t.name for t in tools}
        captured["action_artifact_types"] = action_artifact_types
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr("app.agents.specialists.uniswap.run_specialist", fake_run_specialist)

    state = {"question": "What is the quote for 1 ETH to USDC on Uniswap?"}
    result = await uniswap_node(state)

    assert result["specialist_results"]["uniswap"] == "ok"
    assert "get_uniswap_quote" in captured["tool_names"]
    assert captured["action_artifact_types"]["build_uniswap_swap_tx"] == "action/evm-tx-batch"


@pytest.mark.asyncio
async def test_uniswap_swap_with_wallet(monkeypatch):
    captured = {}

    async def fake_run_specialist(state, *, key, label, system_prompt, tools, action_artifact_types=None):
        captured["system_prompt"] = system_prompt
        captured["action_artifact_types"] = action_artifact_types
        return {
            "specialist_results": {key: "ok"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [],
        }

    monkeypatch.setattr("app.agents.specialists.uniswap.run_specialist", fake_run_specialist)

    evm_owner = "0x1234567890123456789012345678901234567890"
    state = {"question": f"Swap 1 ETH for USDC on Base (Connected wallet: {evm_owner})"}
    await uniswap_node(state)

    assert evm_owner in captured["system_prompt"]
    assert captured["action_artifact_types"]["build_uniswap_swap_tx"] == "action/evm-tx-batch"

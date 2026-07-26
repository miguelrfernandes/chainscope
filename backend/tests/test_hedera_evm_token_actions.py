import json

import pytest

from app.agents.specialists.hedera_wallet_action import hedera_wallet_action_node
from app.tools.hedera_evm_actions import (
    CREATE_FUNGIBLE_TOKEN_SELECTOR,
    HTS_SYSTEM_CONTRACT_ADDRESS,
    build_hts_create_token_evm_tx,
)


@pytest.mark.asyncio
async def test_build_hts_create_token_evm_tx_valid():
    user_address = "0x1111111111111111111111111111111111111111"
    raw_res = await build_hts_create_token_evm_tx.ainvoke(
        {
            "user_evm_address": user_address,
            "name": "MegaCoin",
            "symbol": "MGC",
            "initial_supply": 1000000.0,
            "decimals": 2,
            "memo": "Test token",
        }
    )

    data = json.loads(raw_res)
    assert "error" not in data
    assert data["to"] == HTS_SYSTEM_CONTRACT_ADDRESS
    assert data["to"] == "0x0000000000000000000000000000000000000167"
    assert data["data"].startswith("0x" + CREATE_FUNGIBLE_TOKEN_SELECTOR)
    # Selector for createFungibleToken(HederaToken,int64,int32) per HIP-358 / the HTS
    # system contract ABI. Hardcoded (independent of CREATE_FUNGIBLE_TOKEN_SELECTOR) so a
    # regression to the wrong int/uint types doesn't get lost when both sides shift together.
    assert CREATE_FUNGIBLE_TOKEN_SELECTOR == "0fb65bf3"
    assert data["value"] == "0x" + format(int(30 * 1e18), "x")
    assert "MegaCoin" in data["human_message"]
    assert "MGC" in data["human_message"]


@pytest.mark.asyncio
async def test_build_hts_create_token_evm_tx_invalid_address():
    raw_res = await build_hts_create_token_evm_tx.ainvoke(
        {
            "user_evm_address": "invalid-address",
            "name": "TestToken",
            "symbol": "TST",
        }
    )
    data = json.loads(raw_res)
    assert "error" in data
    assert "Invalid user EVM address" in data["error"]


@pytest.mark.asyncio
async def test_hedera_wallet_action_node_evm_create_token(monkeypatch):
    captured = {}

    async def fake_run_specialist(
        state, *, key, label, system_prompt, tools, action_artifact_types=None
    ):
        captured["system_prompt"] = system_prompt
        captured["tools"] = tools
        captured["tool_names"] = {t.name for t in tools}
        captured["action_artifact_types"] = action_artifact_types

        # Invoke the build_hts_create_token_evm_tx tool directly
        tool = [t for t in tools if t.name == "build_hts_create_token_evm_tx"][0]
        res_json = await tool.ainvoke(
            {
                "user_evm_address": "0x2222222222222222222222222222222222222222",
                "name": "GoldenToken",
                "symbol": "GLD",
                "initial_supply": 500000.0,
                "decimals": 2,
            }
        )

        artifact_type = action_artifact_types["build_hts_create_token_evm_tx"]
        return {
            "specialist_results": {key: "Created HTS token transaction"},
            "raw_data": {key: []},
            "steps": [],
            "sources": [],
            "artifacts": [{"type": artifact_type, "data": res_json}],
        }

    monkeypatch.setattr(
        "app.agents.specialists.hedera_wallet_action.run_specialist", fake_run_specialist
    )

    evm_address = "0x2222222222222222222222222222222222222222"
    question = (
        f"Create an HTS token named GoldenToken symbol GLD with 500000 supply and 2 decimals "
        f"(Connected wallet: {evm_address})"
    )

    state = {
        "question": question,
        "history": [],
    }

    res = await hedera_wallet_action_node(state)

    assert "build_hts_create_token_evm_tx" in captured["tool_names"]
    assert (
        captured["action_artifact_types"]["build_hts_create_token_evm_tx"] == "action/hedera-evm-tx"
    )

    artifacts = res.get("artifacts", [])
    assert len(artifacts) == 1
    assert artifacts[0]["type"] == "action/hedera-evm-tx"

    artifact_data = json.loads(artifacts[0]["data"])
    assert artifact_data["to"] == HTS_SYSTEM_CONTRACT_ADDRESS
    assert artifact_data["data"].startswith("0x" + CREATE_FUNGIBLE_TOKEN_SELECTOR)

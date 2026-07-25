from app.agents.specialists.hedera_action import SYSTEM_PROMPT


def test_hedera_action_prompt_instructs_seed_funding():
    assert "transfer_hbar_tool" in SYSTEM_PROMPT
    assert "1 HBAR" in SYSTEM_PROMPT
    assert "provision_hedera_agent" in SYSTEM_PROMPT

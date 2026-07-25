from app.agents.specialists._shared import _friendly_hedera_action_message


def test_transfer_hbar_message():
    args = {"transfers": [{"account_id": "0.0.1234", "amount": 1.0}]}
    assert _friendly_hedera_action_message("transfer_hbar_tool", args) == "Transfer 1.0 HBAR to 0.0.1234"


def test_transfer_hbar_message_multiple_recipients():
    args = {
        "transfers": [
            {"account_id": "0.0.1", "amount": 1},
            {"account_id": "0.0.2", "amount": 2},
        ]
    }
    assert (
        _friendly_hedera_action_message("transfer_hbar_tool", args)
        == "Transfer 1 HBAR to 0.0.1, 2 HBAR to 0.0.2"
    )


def test_create_topic_message_with_memo():
    assert (
        _friendly_hedera_action_message("create_topic_tool", {"topic_memo": "demo"})
        == "Create a new HCS topic (demo)"
    )


def test_create_topic_message_without_memo():
    assert _friendly_hedera_action_message("create_topic_tool", {}) == "Create a new HCS topic"


def test_submit_topic_message_truncates_long_message():
    long_message = "x" * 100
    result = _friendly_hedera_action_message(
        "submit_topic_message_tool", {"topic_id": "0.0.5", "message": long_message}
    )
    assert result.startswith('Submit message to topic 0.0.5: "')
    assert "..." in result


def test_mint_fungible_token_message():
    assert (
        _friendly_hedera_action_message("mint_fungible_token_tool", {"token_id": "0.0.9", "amount": 5})
        == "Mint 5 of token 0.0.9"
    )


def test_associate_token_message():
    assert (
        _friendly_hedera_action_message("associate_token_tool", {"token_ids": ["0.0.1", "0.0.2"]})
        == "Associate token(s) 0.0.1, 0.0.2 with your account"
    )


def test_unknown_tool_falls_back():
    assert _friendly_hedera_action_message("some_other_tool", {}) == "Transaction ready to sign"

"""Hedera Agent Kit-backed action tools — the acting (not just reporting)
tier for Hedera, alongside app/tools/hedera_mirror.py's read-only data
tools. Two builders, for the two specialists that use them:

- `get_hedera_action_tools` (AUTONOMOUS mode): executes directly, signed and
  submitted by a dedicated backend-held Hedera TESTNET operator account —
  not the user's wallet. Safe because it's testnet HBAR/tokens with no
  real value. Used by hedera_action.py.
- `get_hedera_return_bytes_tools` (RETURN_BYTES mode): builds an unsigned
  transaction and returns it as hex-encoded bytes for the *user's own*
  Hedera wallet to sign and broadcast — the Hedera equivalent of
  app/tools/aave_actions.py's calldata-building. Needs no operator
  credentials at all (nothing is submitted from here); it does need the
  user's Hedera account ID up front, because the Agent Kit bakes the payer
  account into its immutable per-call Context rather than accepting it as a
  regular tool argument (confirmed by reading the installed package's
  `ReturnBytesStrategy.handle`, which requires `context.account_id`). Used
  by hedera_wallet_action.py.
"""

from functools import lru_cache

from hedera_agent_kit.langchain.toolkit import HederaLangchainToolkit
from hedera_agent_kit.plugins import core_account_plugin, core_consensus_plugin, core_token_plugin
from hedera_agent_kit.plugins.core_account_plugin import TRANSFER_HBAR_TOOL
from hedera_agent_kit.plugins.core_consensus_plugin import (
    CREATE_TOPIC_TOOL,
    SUBMIT_TOPIC_MESSAGE_TOOL,
)
from hedera_agent_kit.plugins.core_token_plugin import (
    ASSOCIATE_TOKEN_TOOL,
    CREATE_FUNGIBLE_TOKEN_TOOL,
    MINT_FUNGIBLE_TOKEN_TOOL,
)
from hedera_agent_kit.shared.configuration import AgentMode, Configuration, Context
from hiero_sdk_python import AccountId, Client, Network, PrivateKey
from langchain_core.tools import BaseTool

from app.core.config import get_settings

# Curated action surface — value transfer (HBAR), HCS (create a topic, submit
# a message), HTS (create/mint a fungible token, associate it to an
# account). Kept narrow on purpose, same reasoning as the curated
# per-specialist subgraph lists in docs/graph-api.md: covers a demoable
# slice of account/consensus/token operations without exposing every
# destructive tool (account/token deletion, allowances, EVM deploys) to the
# LLM.
HEDERA_ACTION_TOOL_NAMES = [
    TRANSFER_HBAR_TOOL,
    CREATE_TOPIC_TOOL,
    SUBMIT_TOPIC_MESSAGE_TOOL,
    CREATE_FUNGIBLE_TOKEN_TOOL,
    MINT_FUNGIBLE_TOKEN_TOOL,
    ASSOCIATE_TOKEN_TOOL,
]


@lru_cache
def get_hedera_action_tools() -> list[BaseTool]:
    """Build the Hedera Agent Kit LangChain tools, bound to a dedicated
    backend-held testnet operator account (AUTONOMOUS mode — executes
    immediately, does not touch the user's own wallet/funds).

    Raises RuntimeError if HEDERA_OPERATOR_ACCOUNT_ID / HEDERA_OPERATOR_PRIVATE_KEY
    aren't configured (get a free funded testnet account at
    https://portal.hedera.com/dashboard)."""
    settings = get_settings()
    if not settings.hedera_operator_account_id or not settings.hedera_operator_private_key:
        raise RuntimeError(
            "Hedera action agent requires HEDERA_OPERATOR_ACCOUNT_ID and "
            "HEDERA_OPERATOR_PRIVATE_KEY (a funded testnet account from "
            "https://portal.hedera.com/dashboard) to be set."
        )

    account_id = AccountId.from_string(settings.hedera_operator_account_id)
    private_key = PrivateKey.from_string(settings.hedera_operator_private_key)
    client = Client(Network(network=settings.hedera_network))
    client.set_operator(account_id, private_key)

    toolkit = HederaLangchainToolkit(
        client=client,
        configuration=Configuration(
            tools=HEDERA_ACTION_TOOL_NAMES,
            plugins=[core_account_plugin, core_consensus_plugin, core_token_plugin],
            context=Context(
                mode=AgentMode.AUTONOMOUS, account_id=settings.hedera_operator_account_id
            ),
        ),
    )
    return toolkit.get_tools()


@lru_cache
def get_hedera_return_bytes_tools(user_account_id: str) -> list[BaseTool]:
    """Build the Hedera Agent Kit LangChain tools in RETURN_BYTES mode for a
    specific user's Hedera account — the built transaction's payer/source is
    `user_account_id`, not any backend-held account. Requires no operator
    credentials; nothing is submitted here, only unsigned bytes are built
    (confirmed offline against the installed package: freezing a
    transaction only needs a Client's network node list, not an operator)."""
    settings = get_settings()
    client = Client(Network(network=settings.hedera_network))

    toolkit = HederaLangchainToolkit(
        client=client,
        configuration=Configuration(
            tools=HEDERA_ACTION_TOOL_NAMES,
            plugins=[core_account_plugin, core_consensus_plugin, core_token_plugin],
            context=Context(mode=AgentMode.RETURN_BYTES, account_id=user_account_id),
        ),
    )
    return toolkit.get_tools()

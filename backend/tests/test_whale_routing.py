from app.agents.orchestrator import ROUTER_SYSTEM_PROMPT
from app.agents.specialists.defi_research import SYSTEM_PROMPT as DEFI_RESEARCH_PROMPT
from app.agents.specialists.hedera_wallet_action import (
    CONNECTED_EVM_RE as HEDERA_CONNECTED_EVM_RE,
)
from app.agents.specialists.hedera_wallet_action import (
    CONNECTED_HEDERA_RE as HEDERA_CONNECTED_HEDERA_RE,
)
from app.agents.specialists.portfolio import SYSTEM_PROMPT as PORTFOLIO_PROMPT
from app.agents.specialists.saucerswap import (
    CONNECTED_EVM_RE as SAUCERSWAP_CONNECTED_EVM_RE,
)
from app.agents.specialists.saucerswap import (
    CONNECTED_WALLET_RE as SAUCERSWAP_CONNECTED_WALLET_RE,
)
from app.agents.specialists.uniswap import CONNECTED_EVM_RE as UNISWAP_CONNECTED_EVM_RE


def test_router_prompt_whale_intent():
    assert "whale/top-holder/largest-wallet questions" in ROUTER_SYSTEM_PROMPT
    assert "defi_research, NOT portfolio" in ROUTER_SYSTEM_PROMPT
    assert (
        "Do NOT treat the presence of a connected wallet address suffix as making that wallet the subject of every question"
        in ROUTER_SYSTEM_PROMPT
    )


def test_portfolio_prompt_conditional_wallet():
    assert (
        "ONLY call get_wallet_balances if the user's question is actually asking about their own wallet"
        in PORTFOLIO_PROMPT
    )
    assert "do not fetch balances for the connected wallet" in PORTFOLIO_PROMPT


def test_defi_research_prompt_whale_recipe():
    assert "whale/top-holder rankings" in DEFI_RESEARCH_PROMPT
    assert "search_subgraphs_by_keyword" in DEFI_RESEARCH_PROMPT
    assert "orderBy: balance, orderDirection: desc, first: 10" in DEFI_RESEARCH_PROMPT
    assert "IGNORE any connected wallet suffix" in DEFI_RESEARCH_PROMPT
    assert "uniswap-v3" in DEFI_RESEARCH_PROMPT


def test_wallet_regexes_support_new_and_old_suffix_format():
    addr_evm = "0x1234567890123456789012345678901234567890"
    addr_hedera = "0.0.123456"

    # Old format
    old_evm_prompt = f"What is the APY?\n(Connected wallet: {addr_evm})"
    old_hedera_prompt = f"What is the APY?\n(Connected Hedera wallet: {addr_hedera})"

    # New format
    new_evm_prompt = f'Who are the biggest whales of USDC?\n(Note: if this question is about "my"/"me", the user\'s connected wallet is {addr_evm})'
    new_hedera_prompt = f'Who are the biggest whales of USDC?\n(Note: if this question is about "my"/"me", the user\'s connected Hedera wallet is {addr_hedera})'

    assert UNISWAP_CONNECTED_EVM_RE.search(old_evm_prompt).group(1) == addr_evm
    assert UNISWAP_CONNECTED_EVM_RE.search(new_evm_prompt).group(1) == addr_evm

    assert SAUCERSWAP_CONNECTED_EVM_RE.search(old_evm_prompt).group(1) == addr_evm
    assert SAUCERSWAP_CONNECTED_EVM_RE.search(new_evm_prompt).group(1) == addr_evm

    assert SAUCERSWAP_CONNECTED_WALLET_RE.search(old_hedera_prompt).group(1) == addr_hedera
    assert SAUCERSWAP_CONNECTED_WALLET_RE.search(new_hedera_prompt).group(1) == addr_hedera

    assert HEDERA_CONNECTED_EVM_RE.search(old_evm_prompt).group(1) == addr_evm
    assert HEDERA_CONNECTED_EVM_RE.search(new_evm_prompt).group(1) == addr_evm

    assert HEDERA_CONNECTED_HEDERA_RE.search(old_hedera_prompt).group(1) == addr_hedera
    assert HEDERA_CONNECTED_HEDERA_RE.search(new_hedera_prompt).group(1) == addr_hedera

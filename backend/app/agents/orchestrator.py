from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.state import (
    SPECIALISTS,
    GraphState,
    SpecialistName,
    get_conversation_messages,
    get_history_messages,
)
from app.core.llm import get_llm

ROUTE_LABEL = "Orchestrator"

ROUTER_SYSTEM_PROMPT = f"""You route user questions to ChainScope's specialist
agents. Available specialists: {", ".join(SPECIALISTS)}.

- portfolio: wallet balances, transfers, swaps for the user's own wallet or a specified account.
- defi_research: protocol state, liquidity, rates (Aave, Uniswap, Compound, ...).
- whale/top-holder/largest-wallet questions ('biggest whales', 'top holders of X') → defi_research, NOT portfolio, even if a connected wallet address is present in the message.
- risk_monitor: lending position health factors, liquidation proximity.
- governance: DAO proposals and voting.
- yield_advisor: finds idle/unproductive wallet assets (Aave v3 Sepolia
  reserves: USDC, DAI, LINK, WETH) and proposes a concrete supply action to
  start earning yield on them. Route here for questions like "am I leaving
  money on the table", "what should I do with my idle assets", "put my USDC
  to work", or anything asking for an actionable next step, not just data.
- hedera: Hedera network data — HBAR balances, HTS tokens/NFTs, transactions,
  HCS topic messages, and sub-agents registered in the Vault. Route here for
  questions naming a Hedera account ID ("0.0.<num>"), a token/topic ID,
  mentioning Hedera/HBAR/HCS explicitly, or asking to list, check, create, or
  query sub-agents/agents registered in the Vault (e.g. "Check current agents registered in my vault", "Which agents do I have").
  This is a separate network from the EVM specialists above.
- hedera_action: executing a real Hedera testnet transaction FROM A BACKEND-
  HELD DEMO ACCOUNT (not the user's wallet) — transferring HBAR, creating an
  HCS topic or submitting a topic message, creating/minting an HTS fungible
  token, associating a token. Route here for action requests on Hedera when
  the question does NOT mention a connected Hedera wallet.
- hedera_wallet_action: building the same kinds of Hedera transactions, but
  FOR THE USER'S OWN CONNECTED HEDERA WALLET to sign (nothing executes on
  the backend). Route here instead of hedera_action whenever the question
  contains "Connected Hedera wallet" or otherwise makes clear the
  user wants to act from their own account/funds, not a demo account.
  Neither hedera_action nor hedera_wallet_action are for read-only Hedera
  questions (those go to hedera).
- saucerswap: SaucerSwap (https://www.saucerswap.finance), Hedera's leading
  DEX — finding the best farming/liquidity-pool APRs, and building token
  swap transactions on SaucerSwap for the user's own connected wallet to
  sign. Route here for "what's the best APR on SaucerSwap", "where should I
  farm", or "swap <token> for <token> on SaucerSwap" style questions.
- uniswap: live Uniswap Trading API integration on Ethereum mainnet (chain 1),
  Base (chain 8453), and Sepolia testnet (chain 11155111) for quote-and-swap
  trade execution. Route here for live Uniswap quotes, routes, or swap
  transaction requests on Ethereum mainnet, Base, or Sepolia (e.g. "quote 1 ETH
  to USDC on Ethereum", "swap 100 USDC to WETH on Base", "swap 50 USDC to ETH
  on Sepolia").
- scheduler_admin: scheduling natural-language questions and alerts to run periodically (e.g. "set up daily alerts for USDC whale transactions", "run this every day", "check on X periodically", "notify me daily/weekly about X", "what alerts do I have", "cancel my daily USDC alert"). Explicitly distinct from live one-off data questions which stay with defi_research/portfolio/etc.

Note: Suffixes like "(Note: if this question is about "my"/"me", the user's connected wallet is 0x...)" or "(Connected wallet: 0x...)" identify the user's own wallet when asking about "my" or "me". Do NOT treat the presence of a connected wallet address suffix as making that wallet the subject of every question. Questions asking about token whales, top holders, or other wallets belong in defi_research, not portfolio.

Pick every specialist whose domain the question touches — a compound
question ("compare my Aave and Compound exposure and my wallet balance")
can select more than one. Pick at least one."""

SYNTHESIS_SYSTEM_PROMPT = """You are ChainScope's orchestrator, writing the
final answer to the user. You're given the question and each specialist
agent's findings (pulled from live on-chain data via The Graph). Combine
them into one clear, direct answer in the specialists' voice — cite ONLY the
concrete numbers they found.

CRITICAL SAFETY RULE:
- Strictly summarize ONLY the data returned in the specialists' findings.
- NEVER invent, fabricate, or hallucinate portfolio balances, token amounts, or USD values that were not explicitly returned by the tools.
- If a specialist did not return data for a chain, state that no balance was found on that chain. Do not make up round numbers ($100,000, $50,000, $20,000, etc.).

FORMATTING RULE:
- Open with one short sentence giving the headline number (e.g. total USD value).
- If a specialist's findings already contain a markdown table (a `| ... |` header row), reproduce that table verbatim rather than flattening it into prose or bullet points — do not re-derive or re-order its rows.
- Otherwise, when the findings list 3+ line items with numeric values (balances, positions, rates), format them as a markdown table yourself instead of a bullet list or inline dashes.
- Never cram multiple items onto one line separated by " - "; each row belongs in its own table row or its own bullet."""


class RouteDecision(BaseModel):
    specialists: list[SpecialistName] = Field(
        description="Specialist agents whose domain this question touches, in the order they should run."
    )


async def route_node(state: GraphState) -> dict:
    llm = get_llm().with_structured_output(RouteDecision)
    conv_messages = get_conversation_messages(state)
    decision: RouteDecision = await llm.ainvoke(
        [SystemMessage(content=ROUTER_SYSTEM_PROMPT)] + conv_messages
    )
    route = decision.specialists or ["defi_research"]
    step_text = f"Routing to {', '.join(route)}..."
    return {
        "route": route,
        "steps": [{"agent": ROUTE_LABEL, "text": step_text}],
        "messages": [HumanMessage(content=state["question"])],
    }


async def synthesize_node(state: GraphState) -> dict:
    findings = "\n\n".join(f"## {k}\n{v}" for k, v in state["specialist_results"].items())
    llm = get_llm()
    history_messages = get_history_messages(state)
    prompt_messages = (
        [SystemMessage(content=SYNTHESIS_SYSTEM_PROMPT)]
        + history_messages
        + [HumanMessage(content=f"Question: {state['question']}\n\n{findings}")]
    )
    response = await llm.ainvoke(prompt_messages)
    return {
        "final_answer": response.content,
        "messages": [AIMessage(content=response.content)],
    }

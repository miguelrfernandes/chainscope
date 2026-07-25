from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.core.llm import get_llm

router = APIRouter()


class ConversationTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class SuggestRequest(BaseModel):
    turns: list[ConversationTurn]


class SuggestionItem(BaseModel):
    type: Literal["question", "action"] = Field(
        description=(
            "'question' = a follow-up question the user might ask next; "
            "'action' = a concrete on-chain action to take, like supplying to a pool, "
            "investing in a strategy, or setting up a schedule."
        )
    )
    label: str = Field(
        description=(
            "Short display label shown on the button. "
            "Under 8 words. For actions, phrase as an imperative (e.g. 'Supply USDC to Aave'). "
            "For questions, phrase as a question fragment (e.g. 'What is the current APY?')."
        )
    )
    prompt: str = Field(
        description=(
            "The full message to send to the agent when this item is clicked. "
            "For actions this should be a clear instruction like "
            "'Supply 200 USDC to Aave on Sepolia'. "
            "For questions this is the full question text."
        )
    )


class SuggestedItems(BaseModel):
    items: list[SuggestionItem] = Field(
        description="Exactly 3 suggestions — a mix of follow-up questions and contextual actions."
    )


@router.post("/suggest", response_model=SuggestedItems)
async def suggest(req: SuggestRequest) -> SuggestedItems:
    """
    Generate 3 contextual suggestions (questions or actions) for the current conversation.
    Actions are generated when the conversation is about DeFi strategies, pools, or yield.
    """
    llm = get_llm(temperature=0.7).with_structured_output(SuggestedItems)

    conversation_text = "\n".join(
        f"{t.role.upper()}: {t.text}" for t in req.turns
    )

    messages = [
        SystemMessage(
            content=(
                "You are a blockchain analytics assistant generating 3 contextual suggestions "
                "for a ChainScope conversation. Each suggestion is either a follow-up question "
                "or a concrete on-chain action.\n\n"
                "Rules:\n"
                "- Generate exactly 3 items.\n"
                "- If the conversation mentions yield, APY, pools, strategies, DeFi protocols "
                "  (Aave, SaucerSwap, Uniswap), or idle assets, include 1–2 'action' type items "
                "  such as 'Supply USDC to Aave', 'Invest in this pool', or "
                "  'Set up a weekly rebalance schedule'.\n"
                "- Otherwise generate 3 'question' type items.\n"
                "- Labels must be ≤8 words. Actions use imperative verbs. Questions are fragments.\n"
                "- Prompts for actions should be complete, specific instructions a user would send "
                "  to an agent (include asset, amount, protocol when inferable from context).\n"
                "- Be specific to what was actually discussed — not generic filler.\n"
                "- Supported on-chain actions: Aave v3 Sepolia supply (USDC, DAI, LINK, WETH), "
                "  Hedera scheduled transfers, SaucerSwap swaps."
            )
        ),
        HumanMessage(
            content=f"Conversation so far:\n\n{conversation_text}\n\n"
            "Generate 3 suggestions (questions or actions)."
        ),
    ]

    result = await llm.ainvoke(messages)
    return result

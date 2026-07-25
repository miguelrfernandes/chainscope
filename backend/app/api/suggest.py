from __future__ import annotations

from fastapi import APIRouter
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from app.core.llm import get_llm

router = APIRouter()


class ConversationTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class SuggestRequest(BaseModel):
    turns: list[ConversationTurn]


class SuggestedQuestions(BaseModel):
    questions: list[str]


@router.post("/suggest", response_model=SuggestedQuestions)
async def suggest(req: SuggestRequest) -> SuggestedQuestions:
    """Generate 3 concise follow-up questions for the current conversation."""
    llm = get_llm(temperature=0.7).with_structured_output(SuggestedQuestions)

    conversation_text = "\n".join(
        f"{t.role.upper()}: {t.text}" for t in req.turns
    )

    messages = [
        SystemMessage(
            content=(
                "You are a helpful assistant suggesting follow-up questions for a "
                "blockchain analytics conversation. Based on the conversation so far, "
                "generate exactly 3 short, specific follow-up questions the user might "
                "want to ask next. Each question should be under 12 words, directly "
                "relevant to what was discussed, and actionable. Return only the "
                "questions, no explanations."
            )
        ),
        HumanMessage(
            content=f"Conversation so far:\n\n{conversation_text}\n\n"
            "Suggest 3 follow-up questions."
        ),
    ]

    result = await llm.ainvoke(messages)
    return result

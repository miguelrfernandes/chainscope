import operator
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph.message import add_messages


def merge_dicts(left: dict, right: dict) -> dict:
    return {**left, **right}


def _ensure_base_message(msg: Any) -> BaseMessage | None:
    if isinstance(msg, BaseMessage):
        return msg
    if isinstance(msg, dict):
        role = msg.get("role") or msg.get("type")
        content = msg.get("content", "")
        if role in ("human", "user"):
            return HumanMessage(content=content)
        elif role in ("ai", "assistant"):
            return AIMessage(content=content)
        elif role == "system":
            return SystemMessage(content=content)
    return None


def get_history_messages(state: dict[str, Any]) -> list[BaseMessage]:
    """Returns past conversation messages from state["messages"], excluding the current turn's
    HumanMessage if it is already present as the last message in state["messages"]."""
    raw_messages = list(state.get("messages") or [])
    messages = [m for m in (_ensure_base_message(msg) for msg in raw_messages) if m is not None]
    question = state.get("question", "")
    if (
        messages
        and question
        and isinstance(messages[-1], HumanMessage)
        and messages[-1].content == question
    ):
        return messages[:-1]
    return messages


def get_conversation_messages(state: dict[str, Any]) -> list[BaseMessage]:
    """Returns all conversation messages, ensuring the current turn's HumanMessage is included
    at the end."""
    raw_messages = list(state.get("messages") or [])
    messages = [m for m in (_ensure_base_message(msg) for msg in raw_messages) if m is not None]
    question = state.get("question", "")
    if question:
        if not messages or not (
            isinstance(messages[-1], HumanMessage) and messages[-1].content == question
        ):
            messages.append(HumanMessage(content=question))
    return messages


SpecialistName = Literal[
    "portfolio",
    "defi_research",
    "risk_monitor",
    "governance",
    "yield_advisor",
    "hedera",
    "hedera_action",
    "hedera_wallet_action",
    "saucerswap",
    "uniswap",
    "scheduler_admin",
]

SPECIALISTS: tuple[SpecialistName, ...] = (
    "portfolio",
    "defi_research",
    "risk_monitor",
    "governance",
    "yield_advisor",
    "hedera",
    "hedera_action",
    "hedera_wallet_action",
    "saucerswap",
    "uniswap",
    "scheduler_admin",
)


class StepEvent(TypedDict):
    agent: str
    text: str


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    question: str
    route: list[SpecialistName]
    specialist_results: Annotated[dict[str, Any], merge_dicts]
    raw_data: Annotated[dict[str, Any], merge_dicts]
    sources: Annotated[list[dict], operator.add]
    artifacts: Annotated[list[dict], operator.add]
    steps: Annotated[list[StepEvent], operator.add]
    final_answer: str | None

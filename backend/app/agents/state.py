import operator
from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph.message import add_messages


def merge_dicts(left: dict, right: dict) -> dict:
    return {**left, **right}


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

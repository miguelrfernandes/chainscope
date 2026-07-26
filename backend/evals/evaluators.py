"""LangSmith evaluators for the ChainScope gold dataset: routing correctness (deterministic
set comparison) and answer correctness (LLM-as-judge against a per-example rubric)."""

from langchain_core.messages import HumanMessage, SystemMessage
from langsmith.schemas import Example, Run
from pydantic import BaseModel, Field

from app.core.llm import get_llm


def routing_correctness(run: Run, example: Example) -> dict:
    expected = set((example.outputs or {}).get("expected_route") or [])
    actual = set((run.outputs or {}).get("route") or [])
    union = expected | actual
    score = len(expected & actual) / len(union) if union else 1.0
    return {
        "key": "routing_correctness",
        "score": score,
        "comment": f"expected={sorted(expected)} actual={sorted(actual)}",
    }


JUDGE_SYSTEM_PROMPT = """You are grading whether a blockchain AI assistant's answer to a user
question meets a specific correctness rubric. You are given the question, the rubric describing
what a correct answer must do, and the assistant's actual answer.

Grade strictly against the rubric only. Do not penalize style, verbosity, or formatting choices
that the rubric doesn't mention. If the rubric expects a specific figure and the answer instead
explains it could not find/fetch the data, that counts as FAILING the rubric only if the rubric
required a figure to be present with no fallback allowed for missing data - use judgment based on
whether the underlying specialist would plausibly have had access to that data."""


class AnswerGrade(BaseModel):
    passes: bool = Field(description="Whether the answer satisfies the rubric")
    reasoning: str = Field(description="One or two sentence justification for the verdict")


async def answer_correctness(run: Run, example: Example) -> dict:
    question = (example.inputs or {}).get("question", "")
    criteria = (example.outputs or {}).get("answer_criteria", "")
    answer = (run.outputs or {}).get("answer", "")

    llm = get_llm(temperature=0).with_structured_output(AnswerGrade)
    grade: AnswerGrade = await llm.ainvoke(
        [
            SystemMessage(content=JUDGE_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Question:\n{question}\n\n"
                    f"Rubric for a correct answer:\n{criteria}\n\n"
                    f"Assistant's answer:\n{answer}"
                )
            ),
        ]
    )
    return {
        "key": "answer_correctness",
        "score": 1.0 if grade.passes else 0.0,
        "comment": grade.reasoning,
    }

"""Runs the ChainScope gold dataset through the real agent graph via LangSmith.
Usage: `uv run python -m evals.upload_dataset && uv run python -m evals.run_eval`."""

import asyncio

from langsmith import aevaluate

from evals._env import ensure_langsmith_env
from evals.evaluators import answer_correctness, routing_correctness
from evals.target import run_chainscope
from evals.upload_dataset import DATASET_NAME


async def main() -> None:
    ensure_langsmith_env()
    await aevaluate(
        run_chainscope,
        data=DATASET_NAME,
        evaluators=[routing_correctness, answer_correctness],
        experiment_prefix="chainscope-gold",
        # Kept low: each example makes several sequential LLM calls, and they share one
        # org-wide OpenAI TPM budget - see the comment in target.py for why retries alone
        # aren't enough to make higher concurrency reliable.
        max_concurrency=2,
    )


if __name__ == "__main__":
    asyncio.run(main())

"""LangSmith target function: runs one gold-dataset question through the real agent graph."""

import asyncio
import uuid

import openai

from app.agents.graph import build_graph

_graph = None

# Each example makes several sequential LLM calls (route -> specialist(s) -> analyst ->
# synthesize), and eval runs several examples concurrently, so a shared org-wide TPM budget
# (e.g. gpt-4o-mini) gets contested fast - especially if something else (like a running dev
# server) is also drawing from the same budget. The SDK's own retry budget is too short to
# wait out a per-minute TPM window under that contention, so retry 429s here with backoff.
_RATE_LIMIT_RETRIES = 5
_RATE_LIMIT_BACKOFF_SECONDS = 8


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_chainscope(inputs: dict) -> dict:
    graph = _get_graph()
    config = {"configurable": {"thread_id": f"eval-{uuid.uuid4()}"}}
    state = {
        "question": inputs["question"],
        "route": [],
        "specialist_results": {},
        "raw_data": {},
        "sources": [],
        "artifacts": [],
        "steps": [],
        "final_answer": None,
    }

    for attempt in range(_RATE_LIMIT_RETRIES + 1):
        try:
            result = await graph.ainvoke(state, config=config)
            break
        except openai.RateLimitError:
            if attempt == _RATE_LIMIT_RETRIES:
                raise
            await asyncio.sleep(_RATE_LIMIT_BACKOFF_SECONDS)

    return {
        "answer": result.get("final_answer") or "",
        "route": result.get("route") or [],
        "sources": result.get("sources") or [],
    }

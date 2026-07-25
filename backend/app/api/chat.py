import json

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agents.graph import build_graph

router = APIRouter()
_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


class ChatRequest(BaseModel):
    thread_id: str
    message: str


def _sse(event: str, data: dict) -> dict:
    return {"event": event, "data": json.dumps(data)}


@router.post("/chat")
async def chat(req: ChatRequest):
    graph = get_graph()
    config = {"configurable": {"thread_id": req.thread_id}}
    inputs = {
        "question": req.message,
        "route": [],
        "specialist_results": {},
        "raw_data": {},
        "sources": [],
        "artifacts": [],
        "steps": [],
        "final_answer": None,
    }

    async def event_generator():
        sources: list[dict] = []
        artifacts: list[dict] = []
        final_answer: str | None = None

        try:
            async for update in graph.astream(inputs, config=config, stream_mode="updates"):
                for _node_name, delta in update.items():
                    if "steps" in delta:
                        for step in delta.get("steps", []):
                            yield _sse("step", step)
                    sources.extend(delta.get("sources", []))
                    artifacts.extend(delta.get("artifacts", []))
                    if delta.get("final_answer"):
                        final_answer = delta["final_answer"]
        except Exception as exc:  # noqa: BLE001 - surface the failure to the client instead of dropping the connection
            yield _sse("error", {"message": str(exc)})
            return

        yield _sse(
            "answer",
            {"answer": final_answer or "", "sources": sources, "artifacts": artifacts},
        )

    return EventSourceResponse(event_generator())

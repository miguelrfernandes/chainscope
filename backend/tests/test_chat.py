from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.api.chat as chat_module


def _parse_sse(text: str) -> list[tuple[str, str]]:
    events = []
    for block in text.replace("\r\n", "\n").strip("\n").split("\n\n"):
        if not block.strip():
            continue
        event, data = "message", ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data = line[len("data:"):].strip()
        events.append((event, data))
    return events


def _make_client(monkeypatch, updates=None, raise_after=None):
    class FakeGraph:
        async def astream(self, inputs, config, stream_mode):
            for update in updates or []:
                yield update
            if raise_after is not None:
                raise raise_after

    monkeypatch.setattr(chat_module, "get_graph", lambda: FakeGraph())

    app = FastAPI()
    app.include_router(chat_module.router)
    return TestClient(app)


def test_chat_streams_steps_then_answer(monkeypatch):
    updates = [
        {"orchestrator_route": {"steps": [{"agent": "Orchestrator", "text": "Routing..."}]}},
        {
            "defi_research": {
                "steps": [{"agent": "DeFi research agent", "text": "Querying..."}],
                "sources": [{"label": "src", "id": "sub/1", "query": "{ ... }"}],
            }
        },
        {
            "orchestrator_synthesize": {
                "final_answer": "Utilization is 86%.",
                "artifacts": [{"type": "image/png", "data": "abc123"}],
            }
        },
    ]
    client = _make_client(monkeypatch, updates=updates)

    response = client.post("/chat", json={"thread_id": "t1", "message": "hi"})

    assert response.status_code == 200
    events = _parse_sse(response.text)
    kinds = [e for e, _ in events]
    assert kinds == ["step", "step", "answer"]

    import json

    answer_payload = json.loads(events[-1][1])
    assert answer_payload["answer"] == "Utilization is 86%."
    assert answer_payload["sources"] == [{"label": "src", "id": "sub/1", "query": "{ ... }"}]
    assert answer_payload["artifacts"] == [{"type": "image/png", "data": "abc123"}]


def test_chat_surfaces_graph_errors(monkeypatch):
    client = _make_client(
        monkeypatch,
        updates=[{"orchestrator_route": {"steps": [{"agent": "Orchestrator", "text": "Routing..."}]}}],
        raise_after=RuntimeError("subgraph timed out"),
    )

    response = client.post("/chat", json={"thread_id": "t1", "message": "hi"})

    events = _parse_sse(response.text)
    kinds = [e for e, _ in events]
    assert kinds == ["step", "error"]

    import json

    error_payload = json.loads(events[-1][1])
    assert error_payload["message"] == "subgraph timed out"


def test_chat_requires_message_and_thread_id():
    app = FastAPI()
    app.include_router(chat_module.router)
    client = TestClient(app)

    response = client.post("/chat", json={"thread_id": "t1"})

    assert response.status_code == 422

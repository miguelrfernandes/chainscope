import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.graph import build_graph
from app.agents.orchestrator import route_node, synthesize_node
from app.agents.state import get_conversation_messages, get_history_messages


def test_get_history_and_conversation_messages_helpers():
    # Empty state
    state = {"question": "What is the APY?", "messages": []}
    assert get_history_messages(state) == []
    assert get_conversation_messages(state) == [HumanMessage(content="What is the APY?")]

    # State with prior turn history
    prior_turn = [
        HumanMessage(content="Check my balance"),
        AIMessage(content="Your balance is 100 HBAR"),
    ]
    state_turn2 = {"question": "Transfer 10 of it", "messages": prior_turn}
    assert get_history_messages(state_turn2) == prior_turn
    assert get_conversation_messages(state_turn2) == prior_turn + [
        HumanMessage(content="Transfer 10 of it")
    ]

    # State where route_node already appended HumanMessage(content=question)
    state_route_done = {
        "question": "Transfer 10 of it",
        "messages": prior_turn + [HumanMessage(content="Transfer 10 of it")],
    }
    assert get_history_messages(state_route_done) == prior_turn
    assert get_conversation_messages(state_route_done) == prior_turn + [
        HumanMessage(content="Transfer 10 of it")
    ]


@pytest.mark.asyncio
async def test_route_node_uses_conversation_messages(monkeypatch):
    captured_messages = []

    class FakeRouteDecision:
        specialists = ["hedera"]

    class FakeStructuredLLM:
        async def ainvoke(self, messages):
            captured_messages.extend(messages)
            return FakeRouteDecision()

    class FakeLLM:
        def with_structured_output(self, schema):
            return FakeStructuredLLM()

    monkeypatch.setattr("app.agents.orchestrator.get_llm", lambda: FakeLLM())

    state = {
        "question": "Transfer 10 HBAR to 0.0.123",
        "messages": [
            HumanMessage(content="What is my account ID?"),
            AIMessage(content="Your account is 0.0.999"),
        ],
    }

    res = await route_node(state)
    assert res["route"] == ["hedera"]
    assert len(captured_messages) == 4  # SystemMessage + Human(turn1) + AI(turn1) + Human(turn2)
    assert isinstance(captured_messages[0], SystemMessage)
    assert captured_messages[1].content == "What is my account ID?"
    assert captured_messages[2].content == "Your account is 0.0.999"
    assert captured_messages[3].content == "Transfer 10 HBAR to 0.0.123"


@pytest.mark.asyncio
async def test_synthesize_node_uses_history_messages(monkeypatch):
    captured_messages = []

    class FakeLLM:
        async def ainvoke(self, messages):
            captured_messages.extend(messages)
            return AIMessage(content="Synthesized response")

    monkeypatch.setattr("app.agents.orchestrator.get_llm", lambda: FakeLLM())

    state = {
        "question": "Transfer 10 HBAR to 0.0.123",
        "specialist_results": {"hedera": "Transferred 10 HBAR"},
        "messages": [
            HumanMessage(content="What is my account ID?"),
            AIMessage(content="Your account is 0.0.999"),
            HumanMessage(content="Transfer 10 HBAR to 0.0.123"),
        ],
    }

    res = await synthesize_node(state)
    assert res["final_answer"] == "Synthesized response"
    assert (
        len(captured_messages) == 4
    )  # SystemMessage + Human(turn1) + AI(turn1) + Human(turn2 + findings)
    assert captured_messages[1].content == "What is my account ID?"
    assert captured_messages[2].content == "Your account is 0.0.999"
    assert "Question: Transfer 10 HBAR to 0.0.123" in captured_messages[3].content


@pytest.mark.asyncio
async def test_multi_turn_graph_memory(monkeypatch):
    # Mock subgraph MCP tool fetching to prevent network request in unit test
    async def mock_get_subgraph_tools():
        return []

    monkeypatch.setattr(
        "app.agents.specialists.defi_research.get_subgraph_tools", mock_get_subgraph_tools
    )

    class FakeRouteDecision:
        specialists = ["defi_research"]

    class FakeStructuredLLM:
        async def ainvoke(self, messages):
            return FakeRouteDecision()

    class FakeLLM:
        def with_structured_output(self, schema):
            return FakeStructuredLLM()

        async def ainvoke(self, messages):
            return AIMessage(content="Synthesized answer for the question.")

        def bind_tools(self, tools, **kwargs):
            return self

    class FakeReactAgent:
        async def ainvoke(self, inputs, config=None):
            msgs = inputs["messages"]
            return {"messages": msgs + [AIMessage(content="Found 5% APY")]}

    monkeypatch.setattr("app.agents.orchestrator.get_llm", lambda: FakeLLM())
    monkeypatch.setattr("app.agents.specialists._shared.get_llm", lambda: FakeLLM())
    monkeypatch.setattr(
        "app.agents.specialists._shared.create_react_agent", lambda *a, **k: FakeReactAgent()
    )

    graph = build_graph()
    config = {"configurable": {"thread_id": "multi-turn-test-thread"}}

    # Turn 1
    inputs_turn1 = {
        "question": "What is the APY on Aave?",
        "route": [],
        "specialist_results": {},
        "raw_data": {},
        "sources": [],
        "artifacts": [],
        "steps": [],
        "final_answer": None,
    }

    state_after_turn1 = await graph.ainvoke(inputs_turn1, config=config)
    messages_turn1 = state_after_turn1["messages"]
    assert len(messages_turn1) == 2  # HumanMessage + AIMessage

    # Turn 2
    inputs_turn2 = {
        "question": "What about Compound?",
        "route": [],
        "specialist_results": {},
        "raw_data": {},
        "sources": [],
        "artifacts": [],
        "steps": [],
        "final_answer": None,
    }

    state_after_turn2 = await graph.ainvoke(inputs_turn2, config=config)
    messages_turn2 = state_after_turn2["messages"]
    assert len(messages_turn2) == 4  # Turn 1 (Human+AI) + Turn 2 (Human+AI)
    assert messages_turn2[0].content == "What is the APY on Aave?"
    assert messages_turn2[2].content == "What about Compound?"

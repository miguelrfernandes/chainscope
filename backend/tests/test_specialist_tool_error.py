import pytest
from langchain_core.tools import tool

from app.agents.specialists._shared import run_specialist


@tool
def failing_tool():
    """A tool that raises an exception."""
    raise ValueError("GraphQL syntax error: missing field")


@pytest.mark.asyncio
async def test_run_specialist_handles_tool_error(monkeypatch):
    from langchain_core.runnables import Runnable

    class FakeLLM(Runnable):
        def __init__(self):
            self.calls = 0

        async def ainvoke(self, input_messages, config=None, **kwargs):
            from langchain_core.messages import AIMessage

            self.calls += 1
            if self.calls == 1:
                return AIMessage(
                    content="", tool_calls=[{"name": "failing_tool", "args": {}, "id": "call_1"}]
                )
            return AIMessage(content="Handled error and recovered.")

        def invoke(self, input_messages, config=None, **kwargs):
            import asyncio

            return asyncio.run(self.ainvoke(input_messages, config=config, **kwargs))

        def bind_tools(self, tools, **kwargs):
            return self

    monkeypatch.setattr("app.agents.specialists._shared.get_llm", lambda: FakeLLM())

    state = {"question": "Test query"}
    res = await run_specialist(
        state,
        key="test_key",
        label="Test Label",
        system_prompt="Test prompt",
        tools=[failing_tool],
    )

    assert res["specialist_results"]["test_key"] == "Handled error and recovered."

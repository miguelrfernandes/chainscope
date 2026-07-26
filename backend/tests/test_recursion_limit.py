from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langgraph.errors import GraphRecursionError

from app.agents.specialists._shared import run_specialist


@pytest.mark.asyncio
async def test_run_specialist_recursion_limit():
    """Verify that specialist ReAct agents enforce the recursion_limit guardrail."""
    mock_state = {"question": "What is the yield?"}

    # Simulate an LLM that perpetually calls a tool with identical arguments
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(side_effect=GraphRecursionError("Recursion limit of 30 reached"))

    with patch("app.agents.specialists._shared.create_react_agent", return_value=mock_agent):
        with pytest.raises(GraphRecursionError):
            await run_specialist(
                mock_state,
                key="defi_research",
                label="DeFi Researcher",
                system_prompt="test",
                tools=[],
            )

        # Confirm recursion_limit was passed in config
        mock_agent.ainvoke.assert_called_once()
        _, kwargs = mock_agent.ainvoke.call_args
        assert kwargs.get("config", {}).get("recursion_limit") == 30

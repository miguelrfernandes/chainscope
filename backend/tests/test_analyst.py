import json
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.agents.specialists.analyst import analyst_node
from app.agents.state import GraphState


def make_state(question: str) -> GraphState:
    return {
        "messages": [],
        "question": question,
        "route": ["portfolio"],
        "specialist_results": {},
        "raw_data": {},
        "sources": [],
        "artifacts": [],
        "steps": [],
        "final_answer": None,
    }


@pytest.mark.asyncio
async def test_analyst_node_empty_specialist_results():
    state = make_state("What is my portfolio breakdown?")
    result = await analyst_node(state)
    assert result == {"artifacts": [], "steps": []}


@pytest.mark.asyncio
async def test_analyst_node_no_tool_calls():
    state = make_state("What is my portfolio breakdown?")
    state["specialist_results"] = {"portfolio": "ETH balance: 0.0447"}
    state["raw_data"] = {
        "portfolio": [
            json.dumps(
                {
                    "network": "sepolia",
                    "address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132",
                    "data": [{"symbol": "ETH", "balance": 0.0447}],
                }
            )
        ]
    }

    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AIMessage(content="no artifact needed", tool_calls=[])

    with patch("app.agents.specialists.analyst.get_llm") as mock_get_llm:
        mock_get_llm.return_value.bind_tools.return_value = mock_llm
        result = await analyst_node(state)

    assert result == {"artifacts": [], "steps": []}


@pytest.mark.asyncio
async def test_analyst_node_creates_plotly_artifact():
    state = make_state("What is my portfolio breakdown?")
    state["specialist_results"] = {"portfolio": "ETH: 0.0447"}
    raw_payload = {
        "network": "sepolia",
        "address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132",
        "data": [
            {"symbol": "ETH", "balance": 0.0447, "contract": None, "type": "native"},
            {"symbol": "USDC", "balance": 0.0, "contract": "0x123", "type": "erc20"},
        ],
    }
    state["raw_data"] = {"portfolio": [json.dumps(raw_payload)]}

    code = """
import plotly.express as px
import pandas as pd

raw = '''[{"network": "sepolia", "address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132", "data": [{"symbol": "ETH", "balance": 0.0447}, {"symbol": "USDC", "balance": 0.0}]}]'''
import json
data = json.loads(raw)[0]["data"]
df = pd.DataFrame(data)
fig = px.bar(df, x="symbol", y="balance", title="Portfolio")
"""

    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AIMessage(
        content="",
        tool_calls=[{"name": "run_python", "args": {"code": code}, "id": "call_1"}],
    )

    with patch("app.agents.specialists.analyst.get_llm") as mock_get_llm:
        mock_get_llm.return_value.bind_tools.return_value = mock_llm
        result = await analyst_node(state)

    assert len(result["artifacts"]) == 1
    assert result["artifacts"][0]["type"] == "application/vnd.plotly.v1+json"
    assert len(result["steps"]) == 1
    assert result["steps"][0]["agent"] == "Analyst agent"
    assert result["steps"][0]["text"] == "Transforming results with pandas..."

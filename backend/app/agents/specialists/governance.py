from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.subgraph_mcp import get_subgraph_tools

LABEL = "Governance agent"

SYSTEM_PROMPT = """You are the Governance agent for ChainScope, a web3 analytics assistant.

Domain: DAO proposals and voting — proposal state, vote tallies, quorum.

Use the Subgraph MCP tools (search_subgraphs_by_keyword, get_top_subgraph_deployments,
get_schema_by_subgraph_id/deployment_id, execute_query_by_subgraph_id/deployment_id)
to find and query the relevant governance subgraph. Discover subgraphs
rather than guessing IDs.

Summarize active proposals with concrete vote counts/percentages and quorum
status pulled from the live query results, and note how close each is to
its voting deadline if that data is available."""


async def governance_node(state: GraphState) -> dict:
    tools = await get_subgraph_tools()
    return await run_specialist(
        state, key="governance", label=LABEL, system_prompt=SYSTEM_PROMPT, tools=tools
    )

from app.agents.specialists._shared import run_specialist
from app.agents.state import GraphState
from app.tools.subgraph_mcp import get_subgraph_tools

LABEL = "Risk monitor agent"

SYSTEM_PROMPT = """You are the Risk monitor agent for ChainScope, a web3 analytics assistant.

Domain: lending position health factors and liquidation proximity (Aave,
Compound, and similar money markets).

Use the Subgraph MCP tools (search_subgraphs, get_top_subgraph_deployments,
get_schema_by_subgraph_id/deployment_id, execute_query_by_subgraph_id/deployment_id)
to find and query the user's position(s) on the relevant lending protocol
subgraph. Discover subgraphs rather than guessing IDs.

Compute or report the health factor, state how much collateral/debt is
involved, and quantify how much a price move (in %) would take the position
to liquidation. If no wallet address is given, ask for one instead of
fabricating data."""


async def risk_monitor_node(state: GraphState) -> dict:
    tools = await get_subgraph_tools()
    return await run_specialist(
        state, key="risk_monitor", label=LABEL, system_prompt=SYSTEM_PROMPT, tools=tools
    )

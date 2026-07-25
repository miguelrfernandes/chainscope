"""Client for The Graph's Subgraph MCP server.

Exposes the MCP server's tools (search_subgraphs, get_top_subgraph_deployments,
get_schema_by_subgraph_id, get_schema_by_deployment_id,
execute_query_by_subgraph_id, execute_query_by_deployment_id) as LangChain
tools that specialist agents bind directly. See docs/graph-api.md.
"""

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.core.config import get_settings

_tools_cache: list[BaseTool] | None = None


def _build_client() -> MultiServerMCPClient:
    settings = get_settings()
    headers = {}
    if settings.graph_api_key:
        headers["Authorization"] = f"Bearer {settings.graph_api_key}"

    transport = "sse" if settings.graph_mcp_url.rstrip("/").endswith("/sse") else "streamable_http"

    return MultiServerMCPClient(
        {
            "graph": {
                "url": settings.graph_mcp_url,
                "transport": transport,
                "headers": headers,
            }
        }
    )


async def get_subgraph_tools() -> list[BaseTool]:
    """Fetch (and cache) the full Subgraph MCP tool list."""
    global _tools_cache
    if _tools_cache is not None:
        return _tools_cache

    client = _build_client()
    tools = await client.get_tools()
    _tools_cache = tools
    return tools

from app.agents.specialists._shared import _describe_tool_call


def test_search_subgraphs_description():
    desc = _describe_tool_call("search_subgraphs_by_keyword", {"keyword": "defi"})
    assert "The Graph" in desc
    assert "Searching subgraphs on The Graph for 'defi'..." in desc


def test_get_top_subgraph_deployments_description():
    desc = _describe_tool_call(
        "get_top_subgraph_deployments",
        {"contract_address": "0x67e6bb3400da3af23f1b54623ff5972494b8e132"},
    )
    assert "The Graph" in desc
    assert "0x67e6bb3400da3af23f1b54623ff5972494b8e132" in desc


def test_inspect_schema_description():
    desc = _describe_tool_call(
        "get_schema_by_subgraph_id",
        {"subgraph_id": "0x67e6bb3400da3af23f1b54623ff5972494b8e132"},
    )
    assert "The Graph" in desc
    assert (
        "Inspecting subgraph schema on The Graph (0x67e6bb3400da3af23f1b54623ff5972494b8e132)..."
        in desc
    )

    desc_no_target = _describe_tool_call("get_schema_by_deployment_id", {})
    assert desc_no_target == "Inspecting subgraph schema on The Graph..."


def test_query_tool_description():
    desc = _describe_tool_call(
        "execute_query_by_subgraph_id",
        {"subgraph_id": "aave/protocol-v3-ethereum"},
    )
    assert "The Graph" in desc
    assert "Querying aave/protocol-v3-ethereum on The Graph via Subgraph MCP..." in desc


def test_query_volume_description():
    desc = _describe_tool_call("get_deployment_30day_query_counts", {})
    assert desc == "Checking subgraph query volume on The Graph..."

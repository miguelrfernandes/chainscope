from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.agents.orchestrator import route_node, synthesize_node
from app.agents.specialists.analyst import analyst_node
from app.agents.specialists.defi_research import defi_research_node
from app.agents.specialists.governance import governance_node
from app.agents.specialists.hedera import hedera_node
from app.agents.specialists.hedera_action import hedera_action_node
from app.agents.specialists.hedera_wallet_action import hedera_wallet_action_node
from app.agents.specialists.portfolio import portfolio_node
from app.agents.specialists.risk_monitor import risk_monitor_node
from app.agents.specialists.saucerswap import saucerswap_node
from app.agents.specialists.scheduler_admin import scheduler_admin_node
from app.agents.specialists.uniswap import uniswap_node
from app.agents.specialists.yield_advisor import yield_advisor_node
from app.agents.state import GraphState

SPECIALIST_NODES = {
    "portfolio": portfolio_node,
    "defi_research": defi_research_node,
    "risk_monitor": risk_monitor_node,
    "governance": governance_node,
    "yield_advisor": yield_advisor_node,
    "hedera": hedera_node,
    "hedera_action": hedera_action_node,
    "hedera_wallet_action": hedera_wallet_action_node,
    "saucerswap": saucerswap_node,
    "uniswap": uniswap_node,
    "scheduler_admin": scheduler_admin_node,
}


def _route_to_specialists(state: GraphState) -> list[str]:
    return state["route"]


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("orchestrator_route", route_node)
    for name, node in SPECIALIST_NODES.items():
        graph.add_node(name, node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("orchestrator_synthesize", synthesize_node)

    graph.set_entry_point("orchestrator_route")
    graph.add_conditional_edges(
        "orchestrator_route", _route_to_specialists, list(SPECIALIST_NODES.keys())
    )
    for name in SPECIALIST_NODES:
        graph.add_edge(name, "analyst")
    graph.add_edge("analyst", "orchestrator_synthesize")
    graph.add_edge("orchestrator_synthesize", END)

    return graph.compile(checkpointer=MemorySaver())

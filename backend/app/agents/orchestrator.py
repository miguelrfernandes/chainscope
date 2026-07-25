from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.state import SPECIALISTS, GraphState, SpecialistName
from app.core.llm import get_llm

ROUTE_LABEL = "Orchestrator"

ROUTER_SYSTEM_PROMPT = f"""You route user questions to ChainScope's specialist
agents. Available specialists: {", ".join(SPECIALISTS)}.

- portfolio: wallet balances, transfers, swaps across chains/wallets.
- defi_research: protocol state, liquidity, rates (Aave, Uniswap, Compound, ...).
- risk_monitor: lending position health factors, liquidation proximity.
- governance: DAO proposals and voting.

Pick every specialist whose domain the question touches — a compound
question ("compare my Aave and Compound exposure and my wallet balance")
can select more than one. Pick at least one."""

SYNTHESIS_SYSTEM_PROMPT = """You are ChainScope's orchestrator, writing the
final answer to the user. You're given the question and each specialist
agent's findings (pulled from live on-chain data via The Graph). Combine
them into one clear, direct answer in the specialists' voice — cite the
concrete numbers they found. Do not repeat "as an AI" disclaimers or
describe your own process; just answer. If multiple specialists
contributed, weave their findings together coherently rather than listing
them separately."""


class RouteDecision(BaseModel):
    specialists: list[SpecialistName] = Field(
        description="Specialist agents whose domain this question touches, in the order they should run."
    )


async def route_node(state: GraphState) -> dict:
    llm = get_llm().with_structured_output(RouteDecision)
    decision: RouteDecision = await llm.ainvoke(
        [
            SystemMessage(content=ROUTER_SYSTEM_PROMPT),
            HumanMessage(content=state["question"]),
        ]
    )
    route = decision.specialists or ["defi_research"]
    step_text = f"Routing to {', '.join(route)}..."
    return {
        "route": route,
        "steps": [{"agent": ROUTE_LABEL, "text": step_text}],
        "messages": [HumanMessage(content=state["question"])],
    }


async def synthesize_node(state: GraphState) -> dict:
    findings = "\n\n".join(f"## {k}\n{v}" for k, v in state["specialist_results"].items())
    llm = get_llm()
    response = await llm.ainvoke(
        [
            SystemMessage(content=SYNTHESIS_SYSTEM_PROMPT),
            HumanMessage(content=f"Question: {state['question']}\n\n{findings}"),
        ]
    )
    return {
        "final_answer": response.content,
        "messages": [AIMessage(content=response.content)],
    }

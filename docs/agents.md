# Agents

ChainScope's reasoning layer is a LangGraph graph with one **orchestrator**
node and several **specialist** nodes. This is the "AI agent component that
reasons over or acts on the data" the bounty requires — specialists don't
just print raw subgraph responses, they interpret, cross-reference, and
summarize them.

## Orchestrator

- Receives the user's message + conversation state.
- Classifies intent and routes to one or more specialists (LangGraph
  conditional edges). Simple questions may hit a single specialist; complex
  ones ("compare my Aave and Compound exposure") can fan out to several and
  merge their outputs.
- Owns the final response synthesis: combines specialist outputs, decides
  what tables/charts to surface, and writes the user-facing answer.

## Specialists

Each specialist is a LangGraph node (its own small ReAct-style loop) scoped
to one domain, with its own system prompt and curated subset of Subgraph
MCP tools (so it queries the right subgraphs instead of guessing across
15,000+).

| Specialist | Domain | Example question | Key subgraphs |
|---|---|---|---|
| Portfolio agent | balances, transfers, swaps across wallets/chains | "What's my PnL on this wallet this month?" | token/transfer subgraphs per chain |
| DeFi research agent | protocol state, liquidity, rates | "What's the current utilization on Aave USDC?" | Aave, Uniswap, Compound subgraphs |
| Risk monitor agent | lending health factors, liquidation proximity | "Am I close to liquidation on my Aave position?" | Aave/Compound position subgraphs |
| Governance agent | DAO proposals, votes | "Summarize active Uniswap governance proposals" | governance subgraphs (Snapshot-style) |
| Analyst/visualization agent | takes another agent's data and produces charts/tables via the Python sandbox | "Chart my token balances over the last 90 days" | (consumes prior agents' output) |

Specialists are intentionally narrow — this keeps prompts small, tool
choice accurate, and traces in LangSmith easy to debug per-domain.

## Shared tools

- **Subgraph MCP** — every data-fetching specialist calls out to The
  Graph's Subgraph MCP server rather than hand-rolled GraphQL clients. See
  [graph-api.md](./graph-api.md).
- **Python sandbox** — any specialist (typically routed through the
  analyst agent) can request pandas transforms or chart generation. See
  [python-sandbox.md](./python-sandbox.md).

## State

LangGraph state carries: conversation history, the current user question,
per-specialist scratch results (raw subgraph responses, dataframe
summaries), and any generated artifact references (chart images, tables)
to attach to the final response.

## Observability

Every node execution, tool call, and LLM completion is traced to LangSmith
under a project per environment (`chainscope-dev`, `chainscope-demo`).
This is what lets us debug which specialist mis-routed or which subgraph
query failed during the live demo.

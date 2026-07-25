# The Graph integration

The Graph is ChainScope's **load-bearing, live** data source — this is a
hard qualification requirement for the bounty (no mocked or static data).

## Access path: Subgraph MCP

Agents reach The Graph through the **Subgraph MCP** server rather than
bespoke GraphQL clients per subgraph:

- One MCP connection exposes tools to discover and query any of The
  Graph's 15,000+ subgraphs (Graph Explorer: https://thegraph.com/explorer).
- LangGraph/LangChain agents get MCP tools via a standard MCP client
  adapter, so each specialist just calls e.g. `query_subgraph(subgraph_id,
  graphql_query)` / `search_subgraphs(query)` as regular LangChain tools.
- Because discovery is a tool call too, specialists don't need every
  subgraph ID hardcoded — they can search for the right subgraph
  (e.g. "Aave v3 Ethereum") and then query it.

Keep a short curated list of subgraph IDs per specialist domain (Aave,
Uniswap, Compound, ENS, a couple of chains' native transfer subgraphs) as a
starting point so demo queries are fast and deterministic; fall back to
MCP search for anything outside that list.

## Optional/bonus paths

- **Substreams** — for specialists that need to react to data as it's
  produced (e.g. a risk monitor watching for liquidation-proximity events)
  rather than polling, consider streaming via Substreams
  (https://substreams.dev) instead of periodic MCP queries. Not required
  for MVP.
- **x402** — The Graph supports pay-per-query via x402. If a specialist
  (e.g. the trading/execution-style agent) needs to pay per query
  autonomously rather than using a provisioned API key, x402 is the
  mechanism. This is a stretch goal, not needed to qualify.
- **Nuthatch** — alternate Graph data provider; only relevant if MCP/direct
  subgraph queries don't cover a needed dataset.

## What to avoid

- Do not cache/snapshot subgraph data into static fixtures and query those
  at demo time — judging explicitly excludes mocked/static data.
- Do not just print raw subgraph JSON back to the user — every
  Graph-sourced answer should pass through agent reasoning (interpretation,
  aggregation, cross-referencing, or a pandas transform) before reaching
  the UI.

## Documenting usage for submission

The bounty asks for a brief description of which subgraphs/endpoints/tools
were used. Keep [submission.md](./submission.md)'s "Graph usage" section
up to date as specialists' subgraph lists solidify.

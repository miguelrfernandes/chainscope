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

## API surface reference

What's actually available, and where it fits per specialist.

### Subgraph MCP (primary path)

- `search_subgraphs` — find the right subgraph by keyword/protocol/chain,
  so specialists don't need every ID hardcoded.
- `get_top_subgraph_deployments` — resolve a contract address to the
  best-indexed subgraph for it, ranked by query volume.
- `get_schema_by_subgraph_id` / `get_schema_by_deployment_id` — introspect
  schema before querying, so an agent can self-correct GraphQL instead of
  guessing field names.
- `execute_query_by_subgraph_id` / `execute_query_by_deployment_id` — run
  the query.
- One connection reaches 15,000+ subgraphs across protocols/chains.
  ([graphops/subgraph-mcp](https://github.com/graphops/subgraph-mcp),
  [Subgraph MCP docs](http://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/))

### Token API (REST, normalized cross-chain data)

Useful when a specialist wants a normalized answer without hand-rolling
GraphQL per subgraph:

- Wallet balances (ERC-20 + native) in one call.
- Transfer history with filters, near-real-time.
- NFT metadata/items, NFT transfers (mints/burns/ownership changes),
  collection stats, holders.
([Token API docs](https://thegraph.com/docs/en/token-api/quick-start/),
[Token API beta blog](https://thegraph.com/blog/token-api-the-graph/))

### Substreams (push, not poll)

For low-latency reactive data instead of periodic MCP queries: live
liquidity/price feeds, trading events, **liquidation-proximity events**.
This is the natural fit for the risk monitor specialist — reacting to a
health factor drifting toward liquidation as it happens, rather than
polling on an interval.
([Subgraphs vs Substreams](https://blockchain.news/news/subgraphs-vs-substreams-choosing-data-tools))

### x402 pay-per-query

The Graph Gateway accepts USDC micropayments per query ($0.01/query on
Base), no API key or account required, settled between gateway and
indexers via GraphTally. A genuinely novel "AI + Graph" story (an agent
paying for its own data access) — The Graph team at the ETHLisbon booth
flagged this specifically as interesting, so treat it as a real stretch
goal alongside Substreams, not a lower-priority nice-to-have. Simplest
integration point: have the trading/execution-style agent (or the risk
monitor, when it needs an ad-hoc off-list subgraph) pay per query via
x402 instead of using the provisioned API key, and surface that in the
demo narrative.
([x402 gateway live](https://crypto.news/the-graph-x402-usdc-gateway-goes-live-machine-paywall-for-on-chain-data/),
[GraphTally micropayments](https://thegraph.com/blog/graphtally-micropayments-machine-economy/))

### Use case mapping per specialist

| Specialist | Strong use case | Graph tool |
|---|---|---|
| Portfolio agent | Cross-chain wallet balance + transfer history aggregation, normalized without per-chain GraphQL | Token API (balances, transfers) |
| DeFi research agent | e.g. "Compare Aave v3 vs Compound v3 utilization/APY on Ethereum" — search → schema introspect → query, cross-referenced | Subgraph MCP |
| Risk monitor agent | Watch a position's health factor drift toward liquidation as it happens, not on a poll interval — strongest "innovation" differentiator | Substreams (liquidation-proximity events over Aave/Compound position streams) |
| Governance agent | Track proposal state + voting power changes (e.g. ENS, Compound Governor subgraphs) via discovery rather than hardcoded IDs | Subgraph MCP (search + schema introspection) |

Given judging weights Innovation (10%) and Effective use of The Graph
(35%) highest among the smaller categories, the risk-monitor Substreams
path is still the strongest single demo moment if time is tight — but
x402 is cheap to wire up (one gateway call) and worth doing too, per
booth feedback (see below).

## Booth feedback (The Graph team, ETHLisbon)

- **Top 20 subgraphs by query volume are mostly DeFi.** Check Graph
  Explorer's "most queried" filter (https://thegraph.com/explorer,
  sort by query volume) before finalizing the curated per-specialist
  subgraph list in [graph-api.md](#access-path-subgraph-mcp) — lean
  into DeFi research/risk-monitor specialists (Aave, Uniswap, Compound,
  and similar) as the primary demo path rather than spreading effort
  evenly across portfolio/governance, since that's where the deepest,
  most reliable indexing already exists.
- **Show the query, not just the source.** Every `SourcesRow` /
  `ProvenanceTag` in the UI should carry the actual GraphQL query (or at
  minimum the subgraph id + entity queried) as a tooltip, not just a
  link to Graph Explorer. This makes "load-bearing, live" verifiable at
  a glance during judging instead of asserted. See
  [frontend.md](./frontend.md#provenance-tooltips) for the
  implementation note.
- **x402 is worth doing**, not just documenting — see the x402 section
  above.

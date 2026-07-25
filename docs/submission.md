# Submission — Best AI Use Case of The Graph

ETHLisbon 2026 bounty, $3,000 total ($2,000 / $1,000 for 1st/2nd).

## Qualification checklist

- [ ] Uses The Graph as a **load-bearing** data source (Subgraph MCP) —
      not decorative. Every specialist's answers must trace back to a live
      subgraph query.
- [ ] Consumes **live** data from a Graph provider — no mocked/static
      fixtures at demo time.
- [ ] Has a real **AI/agent reasoning** component acting on the data (the
      LangGraph orchestrator + specialists), not just printing raw query
      results.
- [ ] Public repository.
- [ ] 2–4 minute demo video.
- [ ] Written description of Graph usage: which subgraphs, which
      endpoints/tools (Subgraph MCP), included in this repo (see below)
      and in the submission form.
- [ ] Built during the event; noting any open-source starter kits used.

## Graph usage (fill in as specialists solidify)

| Specialist | Subgraph(s) used | Access method |
|---|---|---|
| Portfolio agent | TBD (per-chain transfer/balance subgraphs) | Subgraph MCP |
| DeFi research agent | TBD (Aave v3, Uniswap v3, Compound v3) | Subgraph MCP |
| Risk monitor agent | TBD (Aave/Compound position subgraphs) | Subgraph MCP |
| Governance agent | TBD | Subgraph MCP |
| Discovery agent | TBD (per-protocol lending/LP/staking subgraphs, wallet-wide) | Subgraph MCP |

## Judging criteria → where it's addressed

- **Effective use of The Graph (35%)** — [graph-api.md](./graph-api.md):
  Subgraph MCP as the sole data-fetching path, curated per-specialist
  subgraph lists, live-only constraint.
- **Usefulness & impact (25%)** — [agents.md](./agents.md): portfolio/PnL,
  DeFi research, and risk-monitoring specialists map directly to the
  bounty's example categories. A Discovery agent addresses booth
  feedback that DeFi is a "sprawl" — it proactively surfaces idle/
  forgotten positions and unclaimed rewards across protocols the user
  has forgotten they interacted with, rather than only answering
  literal questions (see
  [frontend.md](./frontend.md#booth-feedback-defi-sprawl--actionable-answers)).
- **Technical execution (20%)** — [architecture.md](./architecture.md),
  [backend.md](./backend.md): LangGraph multi-agent orchestration,
  streaming responses, LangSmith tracing.
- **Innovation (10%)** — multi-specialist routing + a Python sandbox for
  on-demand pandas analysis/chart generation, rather than a single
  fixed-prompt chatbot. Answers can carry suggested actions with a
  one-click transaction button (claim rewards, add collateral, withdraw
  idle funds) instead of leaving the user to go execute the suggestion
  manually — also booth feedback, see
  [frontend.md](./frontend.md#booth-feedback-defi-sprawl--actionable-answers).
- **Demo & clarity (10%)** — streaming per-step agent status in the UI
  (see [frontend.md](./frontend.md)) makes the multi-agent flow visible
  during the live demo, not just a spinner. Provenance tooltips showing
  the actual query behind each source (see
  [frontend.md](./frontend.md#provenance-tooltips)) make the live-data
  claim verifiable rather than asserted — booth feedback from The Graph
  team.

## Bonus

Extra credit is available for shipping a reusable SKILL or MCP server. If
time allows, consider packaging the Subgraph MCP tool wiring + curated
subgraph list as a standalone, reusable MCP server/skill rather than
inline backend code — see [graph-api.md](./graph-api.md).

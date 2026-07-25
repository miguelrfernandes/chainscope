# ChainScope

ChainScope is a conversational analytics platform for web3 data. Users ask
questions in natural language; a team of specialized AI agents pulls live
on-chain data via [The Graph](https://thegraph.com/) API, analyzes it in a
sandboxed Python environment (pandas, plotting), and returns answers,
tables, and charts back to the user.

Built for ETHLisbon 2026, targeting the **Best AI Use Case of The Graph**
bounty ($3,000 — 1st: $2,000, 2nd: $1,000). See
[submission.md](./submission.md) for how ChainScope maps to the bounty's
qualification requirements and judging criteria.

## Stack

| Layer      | Tech                                              |
|------------|----------------------------------------------------|
| Frontend   | Next.js                                            |
| Backend    | FastAPI                                            |
| Agents     | LangGraph + LangChain                              |
| Observability | LangSmith                                       |
| Data       | The Graph API (subgraph queries)                   |

## Docs index

- [Architecture](./architecture.md) — how the pieces fit together and how a request flows through the system
- [Agents](./agents.md) — the multi-agent design: orchestrator, specialists, and their tools
- [Backend](./backend.md) — FastAPI service layout and API surface
- [Frontend](./frontend.md) — Next.js app structure and how it talks to the backend
- [The Graph integration](./graph-api.md) — how agents query subgraphs via the Subgraph MCP
- [Python sandbox](./python-sandbox.md) — the code-execution tool agents use for pandas/plotting
- [Setup](./setup.md) — local dev environment
- [Submission](./submission.md) — bounty qualification checklist and judging-criteria mapping

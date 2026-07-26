# ChainScope

ChainScope is a conversational analytics and action platform for web3 data.
Users ask questions in natural language; a team of specialized AI agents
pulls live on-chain data via [The Graph](https://thegraph.com/) API,
analyzes it in a sandboxed Python environment (pandas, plotting), and
returns answers, tables, charts, and suggested actions back to the user.

The public homepage is the marketing surface at `/`; the working demo lives
under `/app`, where the live chat experience, wallet context, and action
cards are rendered.

Beyond answering questions, ChainScope's **yield advisor** agent acts on
what it finds: it detects wallet assets sitting idle, checks the current
Aave v3 supply APY via a live Graph subgraph query, and proposes a
one-click deposit — the user approves a real transaction from their own
wallet (Aave v3 on Sepolia testnet), nothing is simulated.

ChainScope's **Hedera action agent** goes further: it moves value
autonomously, executing signed HBAR transfers, HCS topic creation/message
submission, and HTS token create/mint/associate directly against Hedera
Testnet via the Hedera Agent Kit (Python) — no user signature required for
this path (a dedicated backend-held testnet operator account signs and
submits). A second Hedera specialist builds unsigned transaction bytes for
the user's own HashPack or MetaMask wallet to sign when the action should
come from the user's funds instead, including a recurring/scheduled HBAR
transfer signed once via a deployed `ScheduledVault` contract. See
[agents.md](./agents.md#hedera-action-agent--acting-differently-than-the-yield-advisor).

Two more specialists build unsigned swap transactions for the user's own
wallet: **Uniswap** (Ethereum/Base/Sepolia) and **SaucerSwap** (Hedera's
leading DEX). A **scheduler admin** agent lets the user set up recurring
natural-language question alerts (e.g. "check USDC whale activity daily"),
independent of the on-chain scheduled-transfer path above.

## Stack

| Layer         | Tech                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Frontend      | Next.js                                                                    |
| Backend       | FastAPI                                                                    |
| Agents        | LangGraph + LangChain                                                      |
| Inference     | OpenRouter, or 0G Compute Router (config swap, see [setup.md](./setup.md)) |
| Observability | LangSmith                                                                  |
| Data          | The Graph API (subgraph queries) + live Sepolia RPC reads + Hedera Mirror Node |
| Payments      | Hedera Agent Kit (Python) — autonomous HBAR/HTS/HCS transactions on Hedera Testnet |

## Docs index

- [Architecture](./architecture.md) — how the pieces fit together and how a request flows through the system
- [Agents](./agents.md) — the multi-agent design: orchestrator, specialists, and their tools
- [Backend](./backend.md) — FastAPI service layout and API surface
- [Frontend](./frontend.md) — Next.js app structure and how it talks to the backend
- [The Graph integration](./graph-api.md) — how agents query subgraphs via the Subgraph MCP
- [Python sandbox](./python-sandbox.md) — the code-execution tool agents use for pandas/plotting
- [Setup](./setup.md) — local dev environment

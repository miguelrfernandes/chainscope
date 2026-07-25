# Architecture

## Overview

```
                 ┌─────────────────┐
                 │   Next.js UI     │
                 │ (chat + charts)  │
                 └────────┬─────────┘
                          │ REST / SSE (streaming)
                          ▼
                 ┌─────────────────┐
                 │   FastAPI app    │
                 │  (/chat, /api)   │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ LangGraph graph  │
                 │  (orchestrator + │
                 │   specialist     │
                 │   agent nodes)   │
                 └───┬─────────┬────┘
                     │         │
        ┌────────────┘         └────────────┐
        ▼                                    ▼
┌───────────────────┐              ┌───────────────────┐
│  Subgraph MCP tool │              │ Python sandbox tool│
│ (The Graph, live)  │              │ (pandas/plotting)  │
└───────────────────┘              └───────────────────┘

        all agent steps traced to LangSmith
```

## Request flow

1. User sends a question in the Next.js chat UI.
2. The frontend calls the FastAPI backend (streaming response over SSE/WebSocket
   so partial agent output — reasoning steps, generated charts — can render
   as it happens).
3. FastAPI invokes the LangGraph graph for the conversation.
4. An **orchestrator node** decides which specialist agent(s) should handle
   the question (see [agents.md](./agents.md)), and routes to them.
5. Specialist agents call tools:
   - The **Subgraph MCP tool** to fetch live on-chain data from The Graph's
     15,000+ subgraphs (see [graph-api.md](./graph-api.md)). This is the
     load-bearing, must-be-live data source for the bounty — no mocked or
     static data.
   - The **Python sandbox tool** to transform that data with pandas and
     produce tables/charts (e.g. matplotlib/plotly figures, serialized as
     images or JSON specs).
6. Results are merged back by the orchestrator into a final answer, which
   streams to the frontend along with any generated artifacts (tables,
   chart images/specs).
7. Every LLM call and tool invocation is traced in LangSmith for debugging
   and evaluation.

## Why LangGraph

The orchestrator/specialist split is naturally a graph: the orchestrator
node routes to one or more specialist nodes conditionally, specialists can
loop on their own tools (query → inspect → re-query), and the whole thing
needs shared conversation state — this is what LangGraph is for, rather
than a single linear LangChain chain.

## Statelessness / sessions

The backend is stateless per-request beyond the conversation thread id.
LangGraph checkpointing (e.g. an in-memory or Redis/Postgres checkpointer)
holds per-conversation state so a thread can be resumed across turns.

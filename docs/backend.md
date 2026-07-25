# Backend

FastAPI service that hosts the LangGraph agent graph and exposes it to the
frontend.

## Suggested layout

```
backend/
  app/
    main.py            # FastAPI app, CORS, route registration
    api/
      chat.py           # POST /chat (or WS/SSE streaming endpoint)
      health.py
    agents/
      graph.py           # LangGraph graph definition (orchestrator + edges)
      orchestrator.py
      specialists/
        portfolio.py
        defi_research.py
        risk_monitor.py
        governance.py
        analyst.py
      state.py            # shared LangGraph state schema
    tools/
      subgraph_mcp.py     # MCP client setup / tool wiring
      python_sandbox.py   # sandbox tool wiring
    core/
      config.py           # env/settings
      langsmith.py         # tracing setup
  pyproject.toml
```

## API surface (MVP)

- `POST /chat` — body: `{ thread_id, message }`. Streams the agent's
  response (SSE or chunked) including intermediate step markers (which
  specialist is running) and final artifacts (chart specs, tables).
- `GET /health` — liveness check.

Conversation state is keyed by `thread_id` and persisted via a LangGraph
checkpointer (in-memory is fine for the hackathon demo; swap for
Redis/Postgres if persistence across restarts matters).

## Streaming

Use LangGraph's streaming API (`.astream_events`/`.astream`) to forward
per-node progress to the client as Server-Sent Events, so the frontend can
show "Portfolio agent querying Aave subgraph..." style status while
waiting on the final answer — important for demo clarity given multi-step
agent calls can take several seconds.

## CORS

Allow the deployed frontend origin (Vercel preview + production URLs) and
`http://localhost:3000` for local dev.

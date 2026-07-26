# Backend

FastAPI service that hosts the LangGraph agent graph and exposes it to the
frontend.

## Layout

```
backend/
  app/
    main.py                    # FastAPI app, CORS, route registration, scheduler lifespan
    api/
      chat.py                   # POST /chat — SSE streaming endpoint
      health.py                 # GET /health
      suggest.py                 # POST-style follow-up suggestion generation (LLM)
      agent_actions.py            # confirm-agent webhook for managed-agent seed funding
      scheduled_queries.py         # CRUD for scheduled NL-question alerts + run inbox
    agents/
      graph.py                   # LangGraph graph definition (orchestrator + specialist edges)
      orchestrator.py             # route_node / synthesize_node
      state.py                    # shared LangGraph state schema
      specialists/
        _shared.py                 # run_specialist() helper, shared tool-name constants
        portfolio.py
        defi_research.py
        risk_monitor.py
        governance.py
        analyst.py
        yield_advisor.py
        hedera.py                  # read-only Hedera Mirror Node queries
        hedera_action.py            # AUTONOMOUS-mode Hedera actions (backend operator signs)
        hedera_wallet_action.py      # RETURN_BYTES-mode Hedera actions (HashPack/MetaMask sign)
        uniswap.py
        saucerswap.py
        scheduler_admin.py          # manages recurring NL-question alerts
    tools/
      subgraph_mcp.py             # Subgraph MCP client setup / tool wiring
      python_sandbox.py            # sandbox tool wiring
      sandbox_runner.py             # subprocess execution for run_python
      token_api.py                  # Pinax Token API client (portfolio agent)
      aave_actions.py                # Aave v3 Sepolia idle-balance check + supply tx builder
      uniswap_actions.py             # Uniswap Trading API quote/swap tx builder
      saucerswap_actions.py           # SaucerSwap REST client + swap tx builder
      hedera_mirror.py               # Hedera Mirror Node REST client
      hedera_actions.py               # Hedera Agent Kit tool wiring (AUTONOMOUS + RETURN_BYTES)
      hedera_evm_actions.py            # HBAR transfer / HTS create via EVM precompiles (MetaMask)
      hedera_schedule_actions.py        # ScheduledVault contract calldata (recurring MetaMask transfers)
      hedera_provisioner.py             # managed sub-agent account provisioning + key encryption
      _evm_encoding.py                   # shared ABI-encoding helpers for the EVM calldata builders
    core/
      config.py                    # env/settings
      langsmith.py                  # tracing setup
      llm.py                         # ChatOpenAI client per LLM_PROVIDER
      agent_store.py                  # SQLite store for managed Hedera agent accounts
      scheduled_query_store.py         # SQLite store for scheduled NL-question alerts + runs
      scheduler.py                      # APScheduler wiring (init/shutdown, job scheduling)
  pyproject.toml
```

## API surface

- `POST /chat` — body: `{ thread_id, message }`. Streams the agent's
  response (SSE or chunked) including intermediate step markers (which
  specialist is running) and final artifacts (chart specs, tables).
- `GET /health` — liveness check.
- `POST /api/suggest` (`api/suggest.py`) — given recent conversation turns,
  returns LLM-generated follow-up questions/actions for the UI to surface
  as quick-reply chips.
- `POST /api/actions/confirm-agent` (`api/agent_actions.py`) — webhook the
  frontend calls after the user signs a managed agent's seed-funding
  transfer; verifies the tx against Hedera Mirror Node, resolves the
  auto-created account id, and flips the agent's stored status to `ACTIVE`.
- `POST /api/scheduled-queries`, `GET/DELETE .../{id}`, run-inbox endpoints
  (`api/scheduled_queries.py`) — CRUD for the scheduler admin agent's
  recurring natural-language question alerts, backed by
  `core/scheduled_query_store.py` + `core/scheduler.py` (APScheduler).

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

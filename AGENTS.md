# AGENTS.md

Guidance for AI coding agents working in this repo. This is a monorepo:
`frontend/` (Next.js) and `backend/` (FastAPI + LangGraph agents), built for
the ETHLisbon 2026 hackathon (The Graph bounty).

For what the product does and how the pieces fit together, read
[docs/README.md](./docs/README.md) first, then the relevant file in
`docs/`:

- [docs/architecture.md](./docs/architecture.md) — request flow, how
  frontend/backend/agents connect
- [docs/agents.md](./docs/agents.md) — the LangGraph orchestrator +
  specialist agents (this is about the _product's_ AI agents, not this
  AGENTS.md file)
- [docs/backend.md](./docs/backend.md) — FastAPI service layout, API surface
- [docs/frontend.md](./docs/frontend.md) — Next.js app structure, provenance
  tooltip convention
- [docs/graph-api.md](./docs/graph-api.md) — Subgraph MCP integration
- [docs/python-sandbox.md](./docs/python-sandbox.md) — sandboxed
  pandas/plotting tool
- [docs/setup.md](./docs/setup.md) — local env vars and setup

`docs/internal/` holds hackathon-specific notes (pitch deck, submission,
deployment writeup) — not needed for day-to-day coding context.

## Commands

Run from the repo root via `just` (see `Justfile`):

```
just install        # npm install (frontend) + uv sync (backend)
just dev             # run frontend + backend dev servers concurrently
just dev-frontend     # next dev
just dev-backend      # uvicorn app.main:app --reload --port 8000
just build-frontend   # next build
just test             # frontend (vitest) + backend (pytest)
just test-frontend
just test-backend
just lint              # currently just lint-frontend (eslint)
```

Before considering frontend work done, run `just lint-frontend` and
`just test-frontend`. Before considering backend work done, run
`just test-backend`.

## Stack quick reference

- **Frontend**: Next.js 16 (App Router) + React 19, TypeScript, Tailwind
  CSS v4, Vitest. Source in `frontend/src/{app,components,hooks,lib}`.
- **Backend**: FastAPI, Python 3.13, managed with `uv`. LangGraph/LangChain
  for the agent orchestration. Source in
  `backend/app/{api,agents,agents/specialists,tools,core}`.
- **Inference**: OpenRouter or 0G Compute Router (see docs/setup.md).
- **Observability**: LangSmith tracing per environment.
- **Data**: The Graph Subgraph MCP + live Sepolia RPC reads.

## Things to know before touching code

- The yield advisor agent (`backend/app/agents/specialists/yield_advisor.py`,
  `backend/app/tools/aave_actions.py`) builds real `approve()` + `supply()`
  calldata against Aave v3's Sepolia Pool contract. This is testnet-only,
  but transactions are real (user's connected wallet signs and broadcasts
  them) — don't casually change contract addresses, amounts, or calldata
  construction without understanding the safety split between the LLM
  (only picks asset/amount) and the deterministic tool (builds calldata).
- Source citations in the frontend must show the actual query used (see
  the provenance tooltip convention in docs/frontend.md) — don't drop
  `Source.query` when touching `frontend/src/lib/scenarios.ts` or related
  chart/source components.
- `frontend/README.md` is unedited create-next-app boilerplate; it is not
  a source of truth — use `docs/` instead.

## Git workflow

**Work directly on `main`**. Feature branches slow down iteration during
the hackathon. Both frontend and backend deploy from `main` via Vercel's
GitHub integration, so keeping commits small and pushing frequently gives
fast feedback.

The backend is a separate Vercel project rooted at `backend/`. Two things
to remember when touching it:

- After any dependency change, regenerate `backend/requirements.txt` —
  that, not `pyproject.toml`, is what Vercel installs from:
  `cd backend && uv lock && uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt`
- Serverless has no disk and no process between requests, so the deployed
  backend runs on Postgres (`DATABASE_URL`) with `SCHEDULER_MODE=external`;
  a GitHub Actions cron drives scheduled queries. Locally, leave both unset
  to keep SQLite + in-process APScheduler. See docs/setup.md.

- **Small, frequent commits**: Push regularly rather than batching up large
  diffs. Each commit should be one logical change with a clear message.
- **Error Fixing & Testing**: Every time an error is fixed, write a test to
  cover it. Once verified as working, commit and push immediately.
- **Cost-Sensitive & Integration Tests**: Always be mindful of tests that
  incur monetary costs or rely on live external APIs/tokens. Use
  `@pytest.mark.skip` (or skip conditions) so they do not execute
  automatically in standard CI/CD test runs.

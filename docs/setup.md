# Setup

## Prerequisites

- Node.js (for the Next.js frontend)
- Python 3.11+ and a package manager (`uv` or `pip`) for the FastAPI backend
- API keys: LLM provider (OpenAI in production, optionally OpenRouter/0G for
  fallback or experimentation),
  LangSmith, Subgraph MCP endpoint/key, and a code-sandbox provider key if
  using a hosted sandbox (see [python-sandbox.md](./python-sandbox.md))
- A funded Hedera testnet account for the backend operator (free at
  https://portal.hedera.com/dashboard) — needed for the Hedera action
  agent to sign and submit transactions autonomously (see
  [agents.md](./agents.md#hedera-action-agent--acting-differently-than-the-yield-advisor))

## Environment variables

Backend (`.env` in the FastAPI service):

```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
LLM_PROVIDER=openai              # production default; set to "openrouter" or "0g" only if needed

OPENROUTER_API_KEY=...          # optional fallback / local experimentation
ZG_API_KEY=...                  # only needed if LLM_PROVIDER=0g — from pc.testnet.0g.ai
ZG_MODEL=llama-3.3-70b-instruct # confirm against pc.testnet.0g.ai's live model catalog
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=chainscope-dev
GRAPH_MCP_URL=...               # Subgraph MCP server endpoint
GRAPH_API_KEY=...               # if the MCP endpoint requires one
PINAX_API_TOKEN=...             # Pinax Token API, used by the portfolio agent
SEPOLIA_RPC_URL=...             # public Sepolia RPC, used by the yield advisor's idle-balance checks

HEDERA_MIRROR_NODE_BASE_URL=https://testnet.mirrornode.hedera.com  # public, no key
HEDERA_OPERATOR_ACCOUNT_ID=...   # backend-held Hedera testnet account, e.g. 0.0.1234 — funds
HEDERA_OPERATOR_PRIVATE_KEY=...  # AUTONOMOUS-mode actions (HBAR transfer, HCS, HTS); get a free
                                 # funded testnet account at https://portal.hedera.com/dashboard
HEDERA_NETWORK=testnet
# MetaMask/EVM-relay Hedera actions (see agents.md), deployed on Hedera testnet:
HEDERA_SCHEDULE_FACTORY_ADDRESS=...            # deployed ScheduledVaultFactory
HEDERA_NATIVE_TRANSFER_STRATEGY_ADDRESS=...    # deployed NativeTransferStrategy

AGENT_VAULT_ENCRYPTION_KEY=...  # required — AES-256-GCM key encrypting managed agents' Hedera
                                 # private keys at rest; generate with `openssl rand -hex 32`
SAUCERSWAP_API_KEY=...          # defaults to SaucerSwap's public demo key; request a real one
                                 # from support@saucerswap.finance for production use
UNISWAP_API_KEY=...             # from developer.uniswap.org, used by the Uniswap specialist

MANAGED_AGENT_DB_PATH=managed_agents.db      # SQLite store for managed Hedera agent accounts
SCHEDULER_DB_PATH=scheduler.db                # APScheduler job store
SCHEDULED_QUERY_DB_PATH=scheduled_queries.db  # SQLite store for recurring NL-question alerts
```

See `backend/.env.example` for the full list. Swapping `LLM_PROVIDER` to
`0g` is a config-only change (`app/core/llm.py`) — the providers are all
`ChatOpenAI` clients pointed at different OpenAI-compatible `base_url`
values.

Frontend (`.env.local` in the Next.js app):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...  # HashConnect (Hedera wallet) pairing — free at https://cloud.reown.com
```

## Local development

Backend:

```
cd backend
uv sync            # or: pip install -r requirements.txt
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```
cd frontend
npm install
npm run dev
```

## Deployment

- **Frontend**: Vercel. Standard Next.js deploy, no special config beyond
  setting `NEXT_PUBLIC_API_BASE_URL` to the deployed backend URL.
- **Backend**: Vercel, as a **second Vercel project** with its root
  directory set to `backend/` (the frontend project stays as it is). The
  serverless entrypoint is `backend/api/index.py`, which re-exports the same
  FastAPI app — there is no separate serverless code path.

  Three things differ from running on a long-lived host, and all three are
  configuration rather than code:

  | Constraint | Why | Setting |
  | --- | --- | --- |
  | No writable disk | The SQLite files don't survive a request, and `managed_agents` holds the encrypted keys to funded testnet accounts | `DATABASE_URL` (Postgres) |
  | No process between requests | An in-process APScheduler would never fire | `SCHEDULER_MODE=external` |
  | Tick endpoint is unauthenticated by default | Anyone who finds the URL could drive agent runs | `CRON_SECRET` |

  Scheduled queries are then driven by
  `.github/workflows/scheduled-queries.yml`, which POSTs
  `/api/scheduled-queries/tick` every 15 minutes. Vercel's own cron is not
  used: the Hobby plan caps it at one firing per day, which would silently
  break any user-defined cron expression finer than daily. The workflow
  needs `BACKEND_URL` and `CRON_SECRET` as repository secrets, and
  `CRON_SECRET` must match the backend's.

  Two limits are worth knowing, since they are what made this viable:
  Python function bundles may be up to 500MB (raised from 250MB in Feb
  2026), and Fluid compute allows `maxDuration` up to 300s on Hobby — long
  enough for a multi-query LangGraph turn plus a sandbox call. `vercel.json`
  sets `maxDuration: 300`.

  `hedera-agent-kit` pulls in `google-adk`, which drags along
  `pyarrow`/`google-cloud-*` — 411MB of dependencies nothing in this repo
  imports. `[tool.uv] override-dependencies` in `backend/pyproject.toml`
  excludes it, taking the install from 851MB to 460MB and cutting cold-start
  time. Regenerate `backend/requirements.txt` (what Vercel installs from)
  after any dependency change:

  ```
  cd backend && uv lock && uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt
  ```

- **VPS (legacy)** — `deploy/docker-compose.yml` plus Caddy still works and
  is kept for rollback, but `.github/workflows/deploy.yml` is now
  manual-only (`workflow_dispatch`) so it doesn't fail on every push once
  the VPS is gone. On a long-lived host leave `DATABASE_URL` unset and
  `SCHEDULER_MODE=embedded` to keep SQLite + in-process APScheduler.

- Point the frontend's `NEXT_PUBLIC_API_BASE_URL` at whichever backend URL
  is live, and set `CORS_ORIGINS` on the backend to the frontend's Vercel
  origins (production and preview) — the API returns CORS failures rather
  than anything obviously wrong if this is missed.

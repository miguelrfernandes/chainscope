# Setup

## Prerequisites

- Node.js (for the Next.js frontend)
- Python 3.11+ and a package manager (`uv` or `pip`) for the FastAPI backend
- API keys: LLM provider (Anthropic/OpenAI, whichever the agents use),
  LangSmith, Subgraph MCP endpoint/key, and a code-sandbox provider key if
  using a hosted sandbox (see [python-sandbox.md](./python-sandbox.md))

## Environment variables

Backend (`.env` in the FastAPI service):

```
OPENROUTER_API_KEY=...
LLM_PROVIDER=openrouter         # or "0g" to route through 0G Compute Router instead
ZG_API_KEY=...                  # only needed if LLM_PROVIDER=0g — from pc.testnet.0g.ai
ZG_MODEL=llama-3.3-70b-instruct # confirm against pc.testnet.0g.ai's live model catalog
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=chainscope-dev
GRAPH_MCP_URL=...               # Subgraph MCP server endpoint
GRAPH_API_KEY=...               # if the MCP endpoint requires one
PINAX_API_TOKEN=...             # Pinax Token API, used by the portfolio agent
SEPOLIA_RPC_URL=...             # public Sepolia RPC, used by the yield advisor's idle-balance checks
```

See `backend/.env.example` for the full list. Swapping `LLM_PROVIDER` to
`0g` is a config-only change (`app/core/llm.py`) — both providers are the
same `ChatOpenAI` client pointed at a different OpenAI-compatible
`base_url`.

Frontend (`.env.local` in the Next.js app):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
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
- **Backend**: two options —
  - **Vercel** (serverless functions) — simplest to keep everything on one
    platform, but watch execution time limits and the fact that a
    long-running LangGraph agent loop plus a Python sandbox call can
    exceed default serverless timeouts. If using Vercel for the backend,
    raise `maxDuration` on the relevant function and confirm the sandbox
    provider is called out-of-process (not spawning a subprocess in the
    serverless function itself).
  - **VPS** — a long-running `uvicorn`/`gunicorn` process behind a
    reverse proxy (e.g. Caddy/Nginx) with TLS. No timeout ceiling, and
    it's the safer choice if the Python sandbox runs as a local subprocess
    rather than a hosted service. Preferred if agent turns are slow
    (multiple subgraph queries + a sandbox execution can add up) or if
    streaming (SSE/WebSocket) responses need to stay open longer than a
    serverless function allows.

  Recommendation for the hackathon: use the VPS for the backend if the
  Python sandbox is self-hosted (subprocess-based), since that avoids
  serverless timeout/isolation headaches during the live demo; use Vercel
  for the backend only if the sandbox is fully outsourced to a hosted
  provider (E2B/Modal/etc.) so the backend itself stays fast and stateless.

- Point the frontend's `NEXT_PUBLIC_API_BASE_URL` at whichever backend URL
  is live, and make sure CORS on the FastAPI app allows the Vercel
  frontend origin.

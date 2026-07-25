# Frontend

Next.js app providing the chat interface and rendering agent-generated
tables/charts.

## Suggested layout

```
frontend/
  app/
    page.tsx              # chat UI
    api/                  # (optional) thin proxy routes if not calling backend directly
  components/
    Chat/
      MessageList.tsx
      MessageInput.tsx
      AgentStatus.tsx      # shows which specialist is currently running
    Artifacts/
      ChartRenderer.tsx    # renders plotly/vega-lite specs from the sandbox tool
      TableRenderer.tsx
  lib/
    api.ts                 # fetch/SSE client for the FastAPI backend
```

## Talking to the backend

- Read `NEXT_PUBLIC_API_BASE_URL` from env.
- Use `EventSource`/fetch-stream to consume the `/chat` SSE stream, so
  intermediate agent status ("Risk monitor checking Aave position...") and
  the final answer + artifacts render progressively.
- Chart artifacts arrive as plotly/vega-lite JSON specs (preferred) or
  base64 PNGs (fallback) — `ChartRenderer` should handle both.

## Deployment

Deployed on Vercel (see [setup.md](./setup.md#deployment)). Standard
Next.js Vercel deploy — set `NEXT_PUBLIC_API_BASE_URL` to the backend URL
in the Vercel project's environment variables per environment
(preview/production).

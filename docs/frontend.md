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

## Provenance tooltips

Per booth feedback from The Graph team, every source citation in the UI
(`SourcesRow`, `ProvenanceTag`) should show the actual query used, not
just a link out to Graph Explorer — this is what makes "live, load-bearing
Graph data" verifiable at a glance during judging.

- Extend `Source` (`lib/scenarios.ts`) with a `query` field (the GraphQL
  query string or Token API endpoint + params actually sent) and, where
  useful, `deploymentId`/`subgraphId`.
- The backend's SSE payload for each artifact/answer needs to carry this
  alongside the source id/label — it isn't derivable client-side.
- Render it as a tooltip (title attr or a small popover) on hover/focus
  over each `SourcesRow` entry, showing the raw query; keep the existing
  Explorer link as a secondary action.
- Apply this to every specialist's output uniformly, not just one — it's
  cheap per-answer and directly supports the "Effective use of The
  Graph" and "Demo & clarity" judging criteria.

## Booth feedback: DeFi sprawl & actionable answers

Two more pieces of feedback gathered at the booth, both now reflected in
the `lib/scenarios.ts` mockup:

- **"DeFi is a sprawl"** — users have positions scattered across
  protocols/chains they forget about (old deposits never withdrawn,
  unclaimed rewards, dust LPs). A real Discovery agent should proactively
  cross-reference full wallet history against known protocol subgraphs to
  surface these, not just answer the literal question asked. Mocked as
  the `sprawl` scenario ("Do I have any idle or forgotten positions
  across DeFi?").
- **Answers should be actionable, not just informational** — some
  answers should offer a concrete next step (claim rewards, add
  collateral, withdraw idle funds) with a button that actually executes
  a transaction, not just prose telling the user what to do. The scripted
  demo scenarios still mock this via `ScenarioAction`/`SuggestedActions`
  (fake tx hash, labeled "simulated — no funds move"), but the live path
  is real: the **yield advisor** specialist (see
  [agents.md](./agents.md#yield-advisor--acting-not-just-reporting))
  returns an `action/yield-supply` artifact, which `LiveArtifact.tsx`
  renders as `LiveActionCard.tsx` — clicking it switches the wallet to
  Sepolia (`ensureSepolia` in `lib/wallet.ts`) and sends the real
  `approve()` + `supply()` transactions via `eth_sendTransaction`, linking
  to the live tx on Sepolia Etherscan once broadcast.

## Deployment

Deployed on Vercel (see [setup.md](./setup.md#deployment)). Standard
Next.js Vercel deploy — set `NEXT_PUBLIC_API_BASE_URL` to the backend URL
in the Vercel project's environment variables per environment
(preview/production).

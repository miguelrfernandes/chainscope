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

## Hedera wallet (HashConnect)

The EVM wallet (`lib/wallet.ts`, `hooks/useWallet.ts`) talks directly to
`window.ethereum` — no external service needed. Hedera doesn't have an
equivalent injected-provider standard, so a second, separate wallet
integration exists for it:

- `lib/hederaWallet.ts` / `hooks/useHederaWallet.ts` wrap
  [HashConnect](https://docs.hedera.com/native/fundamentals/index#wallet-&-auth-integrations)
  (the standard connector for HashPack), which is WalletConnect-based and
  needs a free project ID from https://cloud.reown.com in
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — see [setup.md](./setup.md).
- `ChatShell.tsx` has a second connect button for the Hedera wallet,
  independent of the EVM one; when connected, it appends
  `(Connected Hedera wallet: 0.0.x)` to the outgoing question, the same
  convention already used for `(Connected wallet: 0x...)`. The backend's
  `hedera_wallet_action` specialist (see
  [agents.md](./agents.md#hedera-action-agent--acting-differently-than-the-yield-advisor))
  extracts that account ID and bakes it in as the transaction's payer
  before building any unsigned bytes.
- `HederaActionCard.tsx` renders the `action/hedera-tx-bytes` artifact:
  decodes the hex-encoded unsigned transaction bytes, reconstructs a
  `Transaction` via `@hashgraph/sdk`, and calls HashConnect's
  `sendTransaction` to sign + broadcast through the paired wallet — the
  Hedera equivalent of `LiveActionCard.tsx`'s `eth_sendTransaction` flow.
  `action/hedera-tx` (from the AUTONOMOUS-mode `hedera_action` specialist,
  which executes against a backend-held demo account, not the user's
  wallet) renders as a plain already-executed receipt in `LiveArtifact.tsx`
  — no signing needed, nothing to connect.

### Human-in-the-Loop (HITL) Action Card Integration Architecture

Chainscope uses a **Client-Side Interceptor & Confirmation Pattern** for frontend Human-in-the-Loop (HITL) wallet transactions:

1. **Stateless Backend Action Emission**:
   - Rather than freezing server threads with LangGraph `interrupt()` calls or waiting on long-lived SSE connections, specialists return structured action artifacts (`action/hedera-tx-bytes` or `action/yield-supply`).
2. **Visual Review & Signature**:
   - `LiveArtifact.tsx` intercepts the artifact stream and renders an interactive UI Action Card (`HederaActionCard.tsx` / `LiveActionCard.tsx`).
   - The user visually reviews transaction metadata (Payer, Target, Amount, Network Fee) in the UI before clicking **Sign & Execute**.
3. **Wallet Broadcast & Webhook Sync**:
   - React invokes the connected wallet SDK (HashConnect / Metamask) for local signature.
   - Upon broadcast, the transaction hash is reported to `/api/actions/confirm-hedera`, updating backend vault state and displaying HashScan explorer links cleanly.

## Deployment

Deployed on Vercel (see [setup.md](./setup.md#deployment)). Standard
Next.js Vercel deploy — set `NEXT_PUBLIC_API_BASE_URL` to the backend URL
in the Vercel project's environment variables per environment
(preview/production).

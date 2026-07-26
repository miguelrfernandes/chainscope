# Frontend

Next.js app providing the homepage landing page at `/`, the chat interface
under `/app`, and the components that render agent-generated tables/charts.

The landing page should stay aligned with the public pitch: live Graph data,
Python analysis, and action cards when the answer should become a
transaction.

## Layout

```
frontend/
  src/
    components/
      Landing.tsx              # homepage experience
      ChatShell.tsx             # chat UI shell, wallet connect buttons
      AppHeader.tsx
      AgentsDrawer.tsx           # sub-agents drawer (managed Hedera agents)
      AgentStatusList.tsx         # shows which specialist(s) are currently running
      StreamingAnswer.tsx
      AssistantTurn.tsx / LiveAssistantTurn.tsx
      LiveArtifact.tsx             # dispatches artifact type -> renderer component
      DataTableArtifact.tsx
      SourcesRow.tsx / ProvenanceTag.tsx
      SuggestedActions.tsx
      HistorySidebar.tsx
      action-cards/                 # per-artifact-type action card renderers
        LiveActionCard.tsx           # action/yield-supply (EVM, Sepolia)
        HederaActionCard.tsx          # action/hedera-tx-bytes (HashPack)
        EvmActionCard.tsx              # generic single-step EVM tx (Uniswap/SaucerSwap)
        HederaEvmActionCard.tsx         # action/hedera-evm-tx(-batch) (MetaMask on Hedera)
        SeedAgentCard.tsx                # managed-agent seed-funding action card
      charts/                         # chart artifact renderers
      providers/                       # wallet/context providers
    lib/
      api.ts                  # fetch/SSE client for the FastAPI backend
      wallet.ts                # EVM wallet (window.ethereum), ensureSepolia/ensureHederaTestnet
      hederaWallet.ts           # HashConnect wrapper
      scenarios.ts               # scripted demo scenario data
      history.ts
    hooks/
      useWallet.ts / useHederaWallet.ts
      useAgentCount.ts             # sub-agent count for AgentsDrawer badge
      useAlertCount.ts               # scheduled-alert unread count
      useSuggestions.ts
      useTxSequence.ts                # multi-step tx sequencing (e.g. approve + supply)
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
  This is HashPack-only: MetaMask has no concept of a raw Hedera SDK
  `Transaction`, so connecting it here doesn't work (see
  [agents.md](./agents.md#hedera-wallet-action-agent--two-signing-paths-kept-side-by-side)
  for the planned MetaMask-compatible path).
  `action/hedera-tx` (from the AUTONOMOUS-mode `hedera_action` specialist,
  which executes against a backend-held demo account, not the user's
  wallet) renders as a plain already-executed receipt in `LiveArtifact.tsx`
  — no signing needed, nothing to connect.

### MetaMask via Hedera's JSON-RPC relay

Alongside HashConnect, a second path covers wallets that only speak
`window.ethereum` (MetaMask): Hedera's JSON-RPC relay (testnet chain id
`296`, `https://testnet.hashio.io/api`) accepts plain `eth_sendTransaction`s
against the same accounts. This reuses the _existing_ EVM plumbing rather
than adding a new wallet integration:

- `ensureHederaTestnet` in `lib/wallet.ts`, mirroring `ensureSepolia`, adds/
  switches to Hedera testnet on the already-connected MetaMask provider.
- `HederaEvmActionCard.tsx`, modeled on `LiveActionCard.tsx`, takes an
  ordered list of `{to, data, value}` steps and signs each via the existing
  `sendTransaction` (`eth_sendTransaction`) helper — no new wallet SDK.
- `LiveArtifact.tsx` branches on `action/hedera-evm-tx` (a single plain
  transfer or HTS token creation) and `action/hedera-evm-tx-batch` (the
  multi-step scheduled-transfer flow via the deployed `ScheduledVault`
  contracts in `contracts/src/`, see [agents.md](./agents.md)).
- Routing between this and the HashConnect path is automatic, based on
  which wallet is connected — not a user-facing choice — since the two
  paths cover different capability surfaces (HashPack: everything
  including HCS; MetaMask: transfers plus whatever's reachable via Hedera's
  System Contract precompiles).
- `EvmActionCard.tsx` is the plain-EVM counterpart used by the Uniswap and
  SaucerSwap specialists' swap transactions (Sepolia/mainnet/Base, not
  Hedera-specific).

### Human-in-the-Loop (HITL) Action Card Integration Architecture

Chainscope uses a **Client-Side Interceptor & Confirmation Pattern** for frontend Human-in-the-Loop (HITL) wallet transactions:

1. **Stateless Backend Action Emission**:
   - Rather than freezing server threads with LangGraph `interrupt()` calls or waiting on long-lived SSE connections, specialists return structured action artifacts (`action/hedera-tx-bytes` or `action/yield-supply`).
2. **Visual Review & Signature**:
   - `LiveArtifact.tsx` intercepts the artifact stream and renders an interactive UI Action Card (`HederaActionCard.tsx` / `LiveActionCard.tsx`, and eventually `HederaEvmActionCard.tsx`).
   - The user visually reviews transaction metadata (Payer, Target, Amount, Network Fee) in the UI before clicking **Sign & Execute**.
3. **Wallet Broadcast & Webhook Sync**:
   - React invokes the connected wallet SDK for local signature — HashConnect today; MetaMask via `eth_sendTransaction` is the planned second path (see above), not an alternative signer for the same artifact.
   - For the managed-agent seed-funding flow specifically, the broadcast transaction id is reported to `POST /api/actions/confirm-agent` (`app/api/agent_actions.py`), which verifies it against the Hedera Mirror Node and flips the agent's stored status to `ACTIVE`. Ordinary transfer/HCS/HTS actions are stateless request/response and don't hit this endpoint — nothing is persisted backend-side for them.

## Deployment

Deployed on Vercel (see [setup.md](./setup.md#deployment)). Standard
Next.js Vercel deploy — set `NEXT_PUBLIC_API_BASE_URL` to the backend URL
in the Vercel project's environment variables per environment
(preview/production).

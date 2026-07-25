import Link from "next/link";
import { Logomark } from "./Logomark";

const STEPS = [
  {
    n: "01",
    title: "Ask",
    body: "A plain-English question about your wallet, a protocol, or a governance vote.",
  },
  {
    n: "02",
    title: "Route",
    body: "An orchestrator agent reads the question and hands it to the right specialist.",
  },
  {
    n: "03",
    title: "Query, live",
    body: "The specialist calls The Graph directly — Subgraph MCP, the Token API, or Substreams. No mocked data, ever.",
  },
  {
    n: "04",
    title: "Analyze & answer",
    body: "A Python sandbox crunches the result with pandas. The answer streams back with charts, tables, and the exact subgraph it came from.",
  },
];

const AGENTS = [
  {
    name: "Portfolio agent",
    body: "Balances, transfers, and PnL across every chain your wallet touches.",
  },
  {
    name: "DeFi research agent",
    body: "Rates, utilization, and liquidity across lending and DEX protocols.",
  },
  {
    name: "Risk monitor agent",
    body: "Watches your lending positions and flags liquidation risk before it's urgent.",
  },
  {
    name: "Governance agent",
    body: "Summarizes DAO proposals and where the vote currently stands.",
  },
  {
    name: "Trading agent",
    body: "Checks live liquidity depth before you size a swap — pays per query via x402 when it needs an off-list subgraph.",
  },
];

const GRAPH_SURFACE = [
  {
    name: "Subgraph MCP",
    body: "One connection reaches 15,000+ subgraphs — agents search, introspect schema, and query without hardcoded IDs.",
  },
  {
    name: "Token API",
    body: "Normalized wallet balances, transfers, and NFT data across chains in one call.",
  },
  {
    name: "Substreams",
    body: "Push, not poll — reacts to liquidation-proximity and price events as they happen.",
  },
  {
    name: "x402",
    body: "Agents can pay per query in USDC, no API key required, for ad-hoc off-list subgraphs.",
  },
];

export function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6">
      <nav className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Logomark className="h-6 w-6 text-[var(--accent)]" />
          <span className="text-lg leading-none">
            <span className="font-[family-name:var(--font-display)] italic text-[var(--ink)]">
              Chain
            </span>
            <span className="font-medium tracking-wide text-[var(--accent)]">
              Scope
            </span>
          </span>
        </div>
        <Link
          href="/app"
          className="border border-[var(--accent)] bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85"
        >
          launch app →
        </Link>
      </nav>

      <header className="animate-fade-up py-16 sm:py-24">
        <p className="mb-4 text-[11px] uppercase tracking-wider text-[var(--accent)]">
          ⌁ built for ethlisbon 2026 — best ai use case of the graph
        </p>
        <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl italic leading-[1.15] text-[var(--ink)] sm:text-5xl">
          Talk to your on-chain activity.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--ink-dim)]">
          ChainScope is a team of specialized AI agents that query live
          blockchain data through The Graph, analyze it in a Python sandbox,
          and answer in plain English — with every claim traceable back to
          the subgraph it came from.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/app"
            className="border border-[var(--accent)] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85"
          >
            launch chainscope →
          </Link>
          <span className="text-xs text-[var(--ink-faint)]">
            no wallet needed to look around — the demo is fully scripted
          </span>
        </div>
      </header>

      <section className="border-t border-[var(--border)] py-16">
        <h2 className="mb-8 text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="animate-fade-up opacity-0 border border-[var(--border)] bg-[var(--bg-raised)]/40 p-5"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="text-xs text-[var(--accent)]">{s.n}</span>
              <h3 className="mt-1 font-medium text-[var(--ink)]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-dim)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] py-16">
        <h2 className="mb-8 text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          The specialists
        </h2>
        <div className="flex flex-col gap-0">
          {AGENTS.map((a, i) => (
            <div
              key={a.name}
              className="animate-fade-up opacity-0 flex flex-col gap-1 border-b border-[var(--border-soft)] py-4 sm:flex-row sm:items-baseline sm:gap-6"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="w-44 shrink-0 text-sm font-medium text-[var(--accent)]">
                {a.name}
              </span>
              <p className="text-sm leading-relaxed text-[var(--ink-dim)]">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] py-16">
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          Powered by The Graph
        </h2>
        <p className="mb-8 max-w-xl text-sm text-[var(--ink-dim)]">
          Every answer is grounded in live Graph data — not a snapshot, not a
          fixture. This is the surface agents actually call.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {GRAPH_SURFACE.map((g, i) => (
            <div
              key={g.name}
              className="animate-fade-up opacity-0 border border-[var(--border)] p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-sm font-medium text-[var(--ink)]">{g.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-dim)]">
                {g.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] py-8 text-xs text-[var(--ink-faint)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          ChainScope — a paper-prototype entry for ETHLisbon 2026&apos;s
          Best AI Use Case of The Graph bounty.
        </span>
        <Link href="/app" className="text-[var(--accent)] hover:underline">
          open the demo →
        </Link>
      </footer>
    </div>
  );
}

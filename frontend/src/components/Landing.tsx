"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AppHeader } from "./AppHeader";

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
    body: "A Python sandbox crunches the result with pandas. The answer streams back with charts, tables, citations, and, when relevant, an action card.",
  },
];

const HIGHLIGHTS = [
  {
    title: "Find what you forgot",
    body: "Cross-reference wallet history, protocol positions, and live subgraphs to surface idle assets, stale LPs, and unclaimed rewards.",
  },
  {
    title: "Answer with receipts",
    body: "Every claim stays traceable to the actual query used, so the evidence is visible instead of buried in the prompt.",
  },
  {
    title: "Act when it matters",
    body: "When the output should become a transaction, the demo can surface a one-click action instead of stopping at prose.",
  },
];

const AGENTS = [
  {
    name: "Portfolio agent",
    body: "Balances, transfers, and PnL across every chain your wallet touches.",
  },
  {
    name: "Discovery agent",
    body: "Finds forgotten deposits, dust LPs, and unclaimed rewards across protocols and chains.",
  },
  {
    name: "Risk monitor agent",
    body: "Watches your lending positions and flags liquidation risk before it's urgent.",
  },
  {
    name: "Yield advisor agent",
    body: "Surfaces idle assets and points to the highest-confidence next step when they could be earning yield.",
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

const slowEase: [number, number, number, number] = [0.16, 1, 0.3, 1];


const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.85,
      ease: slowEase,
    },
  },
};

export function Landing() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6 overflow-hidden">
      {/* Ambient background glow layers */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-[120px] animate-ambient-glow" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-[var(--success)]/8 blur-[120px] animate-ambient-glow" style={{ animationDelay: "-8s" }} />

      <AppHeader activePage="landing" />

      <motion.header
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.95, ease: slowEase }}
        className="py-16 sm:py-24"
      >
        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: slowEase }}
          className="text-xs uppercase tracking-[0.24em] text-[var(--accent)] font-semibold"
        >
          Live web3 research copilot
        </motion.p>
        <h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-4xl italic leading-[1.15] text-[var(--ink)] sm:text-5xl">
          Ask a question. Get live answers. Trigger the next step.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--ink-dim)]">
          ChainScope routes questions to specialist agents, queries live Graph
          data, analyzes the result in a Python sandbox, and can surface
          one-click actions when the answer should become a transaction.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <motion.div
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.25, ease: slowEase }}
          >
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_0_20px_rgba(255,180,84,0.3)] transition-all hover:shadow-[0_0_30px_rgba(255,180,84,0.5)]"
            >
              launch app <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          </motion.div>
          <span className="text-xs text-[var(--ink-faint)]">
            no wallet needed to look around — connect one when you want saved
            threads and action cards
          </span>
        </div>
      </motion.header>

      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="border-t border-[var(--border)] py-12"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <motion.div
              key={item.title}
              variants={itemVariants}
              whileHover={{
                y: -6,
                scale: 1.02,
                boxShadow: "0 16px 32px -8px rgba(0, 0, 0, 0.5), 0 0 20px -2px rgba(255, 180, 84, 0.12)",
                borderColor: "rgba(255, 180, 84, 0.35)",
              }}
              transition={{ duration: 0.35, ease: slowEase }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60 p-5 backdrop-blur-md transition-all cursor-default"
            >
              <h2 className="font-medium text-[var(--ink)]">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="border-t border-[var(--border)] py-16"
      >
        <h2 className="mb-8 text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {STEPS.map((s) => (
            <motion.div
              key={s.n}
              variants={itemVariants}
              whileHover={{
                y: -6,
                scale: 1.02,
                boxShadow: "0 16px 32px -8px rgba(0, 0, 0, 0.5), 0 0 20px -2px rgba(255, 180, 84, 0.12)",
                borderColor: "rgba(255, 180, 84, 0.35)",
              }}
              transition={{ duration: 0.35, ease: slowEase }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/50 p-5 backdrop-blur-md transition-all cursor-default"
            >
              <span className="text-xs font-mono font-semibold text-[var(--accent)]">{s.n}</span>
              <h3 className="mt-1 font-medium text-[var(--ink)]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-dim)]">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="border-t border-[var(--border)] py-16"
      >
        <h2 className="mb-8 text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
          The specialists
        </h2>
        <div className="flex flex-col gap-1">
          {AGENTS.map((a) => (
            <motion.div
              key={a.name}
              variants={itemVariants}
              whileHover={{
                x: 6,
                backgroundColor: "rgba(255, 180, 84, 0.05)",
                borderColor: "rgba(255, 180, 84, 0.25)",
              }}
              transition={{ duration: 0.3, ease: slowEase }}
              className="flex flex-col gap-1 rounded-lg border-b border-[var(--border-soft)] px-3 py-4 sm:flex-row sm:items-baseline sm:gap-6 transition-colors cursor-default"
            >
              <span className="w-44 shrink-0 text-sm font-medium text-[var(--accent)]">
                {a.name}
              </span>
              <p className="text-sm leading-relaxed text-[var(--ink-dim)]">
                {a.body}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="border-t border-[var(--border)] py-16"
      >
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
          Powered by The Graph
        </h2>
        <p className="mb-8 max-w-xl text-sm text-[var(--ink-dim)]">
          Every answer is grounded in live Graph data — not a snapshot, not a
          fixture. This is the surface agents actually call.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {GRAPH_SURFACE.map((g) => (
            <motion.div
              key={g.name}
              variants={itemVariants}
              whileHover={{
                y: -5,
                scale: 1.02,
                boxShadow: "0 16px 32px -8px rgba(0, 0, 0, 0.5), 0 0 20px -2px rgba(111, 227, 161, 0.15)",
                borderColor: "rgba(111, 227, 161, 0.35)",
              }}
              transition={{ duration: 0.35, ease: slowEase }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/40 p-4 backdrop-blur-md transition-all cursor-default"
            >
              <p className="text-sm font-medium text-[var(--ink)]">{g.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-dim)]">
                {g.body}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <footer className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] py-8 text-xs text-[var(--ink-faint)] sm:flex-row sm:items-center sm:justify-between">
        <span>ChainScope</span>

        <motion.div whileHover={{ x: 3 }} transition={{ duration: 0.2 }}>
          <Link href="/app" className="text-[var(--accent)] hover:underline font-medium">
            open the app →
          </Link>
        </motion.div>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { motion, useAnimationFrame, useMotionValue } from "framer-motion";
import { AppHeader } from "./AppHeader";
import { AaveMark, GraphMark, HederaMark, UniswapMark } from "./IntegrationIcons";

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
    body: "The specialist calls The Graph directly through Subgraph MCP, the Token API, or Substreams, pulling live data every time.",
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
    body: "Every claim links back to the actual query that produced it, so you can see the evidence yourself.",
  },
  {
    title: "Act when it matters",
    body: "When an answer should become a transaction, the demo can surface a one-click action to do it.",
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
    body: "Checks live liquidity depth before you size a swap, paying per query via x402 when it needs an off-list subgraph.",
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
    body: "Streams liquidation-proximity and price events the moment they happen.",
  },
  {
    name: "x402",
    body: "Agents can pay per query in USDC, no API key required, for ad-hoc off-list subgraphs.",
  },
];

const INTEGRATIONS = [
  {
    name: "Uniswap",
    Icon: UniswapMark,
    body: "Live swap routing and depth checks via the Uniswap Trading API, including Sepolia, before the trading agent sizes a position.",
  },
  {
    name: "Aave",
    Icon: AaveMark,
    body: "Reads and writes real lending positions (supply, borrow, health factor), so the risk monitor can take action directly.",
  },
  {
    name: "Hedera",
    Icon: HederaMark,
    body: "Native HBAR and token actions through Mirror Node and the Hedera SDK, verified on-chain before an action card is shown.",
  },
  {
    name: "The Graph",
    Icon: GraphMark,
    body: "Subgraph MCP, the Token API, and Substreams: the live query surface every specialist calls.",
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

const GRAVITY = 1500; // px/s^2

type Ball = { id: number; x: number; y: number; vx: number };

function GravityBall({ ball, onDone }: { ball: Ball; onDone: (id: number) => void }) {
  const y = useMotionValue(ball.y);
  const x = useMotionValue(ball.x);
  const rotate = useMotionValue(0);
  const vy = useRef(-560 - Math.random() * 260);

  useAnimationFrame((_, delta) => {
    const dt = Math.min(delta, 32) / 1000;
    vy.current += GRAVITY * dt;
    y.set(y.get() + vy.current * dt);
    x.set(x.get() + ball.vx * dt);
    rotate.set(rotate.get() + ball.vx * dt * 0.6);

    if (y.get() > window.innerHeight + 40) {
      onDone(ball.id);
    }
  });

  return (
    <motion.div
      style={{ position: "fixed", top: 0, left: 0, x, y, rotate }}
      initial={{ opacity: 1, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none z-[100] -ml-[6px] -mt-[6px] h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_10px_2px_rgba(255,180,84,0.55)]"
    />
  );
}

function GravityLayer({ balls, onDone }: { balls: Ball[]; onDone: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      {balls.map((ball) => (
        <GravityBall key={ball.id} ball={ball} onDone={onDone} />
      ))}
    </>,
    document.body,
  );
}

export function Landing() {
  const [balls, setBalls] = useState<Ball[]>([]);
  const nextBallId = useRef(0);

  const launchBall = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    const id = nextBallId.current++;
    setBalls((prev) => [
      ...prev,
      { id, x: e.clientX, y: e.clientY, vx: (Math.random() - 0.5) * 320 },
    ]);
  };

  const removeBall = (id: number) => {
    setBalls((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div
      onClick={launchBall}
      className="cursor-reticle relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6 overflow-hidden"
    >
      <GravityLayer balls={balls} onDone={removeBall} />
      <AppHeader activePage="landing" />

      <motion.header
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.95, ease: slowEase }}
        className="relative py-16 sm:py-24"
      >
        {/* Floating integration marks, à la Uniswap's intro page */}
        <div className="pointer-events-none absolute inset-0 hidden overflow-visible sm:block">
          <motion.div
            className="absolute right-[2%] top-[6%] h-20 w-20 drop-shadow-[0_8px_24px_rgba(255,46,159,0.25)]"
            animate={{ y: [0, -18, 0], rotate: [0, 6, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <UniswapMark className="h-full w-full" />
          </motion.div>
          <motion.div
            className="absolute right-[22%] top-[2%] h-14 w-14 drop-shadow-[0_8px_24px_rgba(139,92,246,0.25)]"
            animate={{ y: [0, 16, 0], rotate: [0, -5, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          >
            <AaveMark className="h-full w-full" />
          </motion.div>
          <motion.div
            className="absolute right-[10%] top-[46%] h-16 w-16 drop-shadow-[0_8px_24px_rgba(130,89,239,0.25)]"
            animate={{ y: [0, -14, 0], rotate: [0, 4, 0] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          >
            <HederaMark className="h-full w-full" />
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: slowEase }}
          className="text-xs uppercase tracking-[0.24em] text-[var(--accent)] font-semibold"
        >
          Live web3 research copilot
        </motion.p>
        <h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-4xl italic leading-[1.15] text-[var(--ink)] sm:text-5xl">
          Turn questions into on-chain actions.
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
        <h2 className="mb-6 text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
          Integrations
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATIONS.map((item) => (
            <motion.div
              key={item.name}
              variants={itemVariants}
              whileHover={{
                y: -6,
                scale: 1.02,
                boxShadow: "0 16px 32px -8px rgba(0, 0, 0, 0.5), 0 0 20px -2px rgba(255, 180, 84, 0.12)",
                borderColor: "rgba(255, 180, 84, 0.35)",
              }}
              transition={{ duration: 0.35, ease: slowEase }}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60 p-5 backdrop-blur-md transition-all"
            >
              <item.Icon className="h-10 w-10" />
              <h3 className="font-medium text-[var(--ink)]">{item.name}</h3>
              <p className="text-sm leading-relaxed text-[var(--ink-dim)]">
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
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60 p-5 backdrop-blur-md transition-all"
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
        <h2 className="mb-12 text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
          How it works
        </h2>

        <div className="relative">
          {/* Connector line + traveling light, desktop only */}
          <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-[var(--border)] sm:block">
            <motion.div
              className="absolute top-1/2 h-px w-40 -translate-y-1/2"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,180,84,0.9), rgba(111,227,161,0.7), transparent)",
                filter: "blur(1px)",
              }}
              animate={{ left: ["-10%", "100%"] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="grid gap-10 sm:grid-cols-4 sm:gap-6">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                variants={itemVariants}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.35, ease: slowEase }}
                className="relative flex flex-col items-start gap-3 sm:items-center sm:text-center"
              >
                <motion.span
                  className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-raised)] font-mono text-xs font-semibold text-[var(--accent)] shadow-[0_0_0_4px_var(--bg)]"
                  whileHover={{
                    scale: 1.1,
                    borderColor: "rgba(255, 180, 84, 0.5)",
                    boxShadow: "0 0 20px -2px rgba(255, 180, 84, 0.4), 0 0 0 4px var(--bg)",
                  }}
                  animate={{
                    boxShadow: [
                      "0 0 0px rgba(255,180,84,0), 0 0 0 4px var(--bg)",
                      "0 0 16px rgba(255,180,84,0.35), 0 0 0 4px var(--bg)",
                      "0 0 0px rgba(255,180,84,0), 0 0 0 4px var(--bg)",
                    ],
                  }}
                  transition={{
                    boxShadow: {
                      duration: 3.2,
                      repeat: Infinity,
                      ease: "linear",
                      delay: (i * 3.2) / STEPS.length,
                    },
                  }}
                >
                  {s.n}
                </motion.span>
                <div>
                  <h3 className="font-medium text-[var(--ink)]">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-dim)]">
                    {s.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
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
              className="flex flex-col gap-1 rounded-lg border-b border-[var(--border-soft)] px-3 py-4 sm:flex-row sm:items-baseline sm:gap-6 transition-colors"
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
        <div className="mb-2 flex items-center gap-2.5">
          <GraphMark className="h-6 w-6" />
          <h2 className="text-xs uppercase tracking-wider text-[var(--ink-faint)] font-semibold">
            Powered by The Graph
          </h2>
        </div>
        <p className="mb-8 max-w-xl text-sm text-[var(--ink-dim)]">
          Every answer is grounded in live Graph data — the same surface
          agents query in production.
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
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/40 p-4 backdrop-blur-md transition-all"
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { SCENARIOS, HISTORY, type Scenario } from "@/lib/scenarios";
import { fetchUserAgents, streamChat } from "@/lib/api";
import {
  deleteThread,
  loadThreads,
  saveThread,
  type StoredThread,
} from "@/lib/history";
import { useWallet } from "@/hooks/useWallet";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { AssistantTurn } from "./AssistantTurn";
import { LiveAssistantTurn, type LiveState } from "./LiveAssistantTurn";
import { HistorySidebar } from "./HistorySidebar";
import { AgentsDrawer } from "./AgentsDrawer";
import { AppHeader } from "./AppHeader";
import { Cpu, Bot } from "lucide-react";




type Message =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      kind: "history";
      scenario: Scenario | null;
    }
  | { id: number; role: "assistant"; kind: "live"; live: LiveState };

type ModelChoice = "chainscope" | "0g";

const MODEL_OPTIONS: Array<{ value: ModelChoice; label: string }> = [
  { value: "chainscope", label: "ChainScope" },
  { value: "0g", label: "0G Compute" },
];


let nextId = 1;

function newThreadId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const EXAMPLE_IDS = new Set(SCENARIOS.map((s) => s.id));

export function ChatShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useWallet();
  const hederaWallet = useHederaWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [promptOffset, setPromptOffset] = useState(0);
  const [selectedModel, setSelectedModel] = useState<ModelChoice>("chainscope");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"wallet" | "agents" | "schedules">("wallet");

  const [agentCount, setAgentCount] = useState<number>(() => {
    if (typeof window === "undefined" || !wallet.address) return 0;
    try {
      const cached = localStorage.getItem(
        `chainscope_cached_agents_${wallet.address.toLowerCase()}`
      );
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (!wallet.address) return;

    try {
      const cached = localStorage.getItem(
        `chainscope_cached_agents_${wallet.address.toLowerCase()}`
      );
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const count = parsed.length;
          queueMicrotask(() => {
            if (!ignore) setAgentCount(count);
          });
        }
      }
    } catch {}

    fetchUserAgents(wallet.address)
      .then((agents) => {
        if (!ignore) setAgentCount(agents.length);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [wallet.address, drawerOpen, messages]);

  const visiblePrompts = useMemo(() => {
    const total = SCENARIOS.length;
    return [
      SCENARIOS[promptOffset % total],
      SCENARIOS[(promptOffset + 1) % total],
      SCENARIOS[(promptOffset + 2) % total],
    ];
  }, [promptOffset]);

  useEffect(() => {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function activeThreadSnapshot(updatedAt: number): StoredThread | null {
    if (!activeThreadId || EXAMPLE_IDS.has(activeThreadId)) return null;
    const relevant = messages.filter(
      (
        m,
      ): m is Extract<
        Message,
        { role: "user" } | { role: "assistant"; kind: "live" }
      > => m.role === "user" || (m.role === "assistant" && m.kind === "live"),
    );
    if (relevant.length === 0) return null;
    const firstUser = relevant.find(
      (m): m is Extract<Message, { role: "user" }> => m.role === "user",
    );
    if (!firstUser) return null;
    return {
      id: activeThreadId,
      title: firstUser.text,
      updatedAt,
      messages: relevant.map((m) =>
        m.role === "user"
          ? { role: "user", text: m.text }
          : { role: "assistant", live: m.live },
      ),
    };
  }

  // Sidebar list: saved threads from local storage, sorted by updatedAt
  const threads = useMemo(() => {
    const base = wallet.address ? loadThreads(wallet.address) : [];
    const saved = base.find((t) => t.id === activeThreadId);
    const timestamp = saved ? saved.updatedAt : 0;
    const live = activeThreadSnapshot(timestamp);
    if (!live) return base;
    return base.map((t) => (t.id === live.id ? live : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, activeThreadId, messages]);

  // Persist the active conversation to this wallet's local history whenever it changes.
  useEffect(() => {
    if (!wallet.address) return;
    const base = loadThreads(wallet.address);
    const saved = base.find((t) => t.id === activeThreadId);
    const snapshot = activeThreadSnapshot(saved ? saved.updatedAt : Date.now());
    if (!snapshot) return;
    saveThread(wallet.address, snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeThreadId, wallet.address]);

  // Sync thread parameter from URL on mount or wallet address update
  const threadParam = searchParams.get("thread");

  useEffect(() => {
    if (!threadParam) {
      if (lastSyncedRef.current !== null) {
        lastSyncedRef.current = null;
      }
      return;
    }

    if (threadParam === lastSyncedRef.current) return;

    if (EXAMPLE_IDS.has(threadParam)) {
      lastSyncedRef.current = threadParam;
      openExample(threadParam);
      return;
    }

    if (wallet.address) {
      const stored = loadThreads(wallet.address);
      if (stored.some((t) => t.id === threadParam)) {
        lastSyncedRef.current = threadParam;
        openThread(threadParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, wallet.address]);

  function updateLive(id: number, updater: (live: LiveState) => LiveState) {
    setMessages((msgs) =>
      msgs.map((m) =>
        m.id === id && m.role === "assistant" && m.kind === "live"
          ? { ...m, live: updater(m.live) }
          : m,
      ),
    );
  }

  function ask(question: string) {
    if (busy || !wallet.connected || !question.trim()) return;
    const q = question.trim();
    const threadId =
      activeThreadId && !EXAMPLE_IDS.has(activeThreadId)
        ? activeThreadId
        : newThreadId();
    const assistantId = nextId++;

    lastSyncedRef.current = threadId;
    setActiveThreadId(threadId);
    router.replace(`/app?thread=${encodeURIComponent(threadId)}`);
    setLoadedFromHistory(false);
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: nextId++, role: "user", text: q },
      {
        id: assistantId,
        role: "assistant",
        kind: "live",
        live: {
          steps: [],
          answer: null,
          sources: [],
          artifacts: [],
          error: null,
        },
      },
    ]);
    setInput("");

    let promptWithWallet =
      wallet.address && !q.toLowerCase().includes(wallet.address.toLowerCase())
        ? `${q}\n(Connected wallet: ${wallet.address})`
        : q;
    if (
      hederaWallet.accountId &&
      !promptWithWallet.includes(hederaWallet.accountId)
    ) {
      promptWithWallet += `\n(Connected Hedera wallet: ${hederaWallet.accountId})`;
    }

    streamChat(
      threadId,
      promptWithWallet,
      {
        onStep: (step) =>
          updateLive(assistantId, (l) => ({ ...l, steps: [...l.steps, step] })),
        onAnswer: (payload) =>
          updateLive(assistantId, (l) => ({
            ...l,
            answer: payload.answer,
            sources: payload.sources,
            artifacts: payload.artifacts,
          })),
        onError: (message) =>
          updateLive(assistantId, (l) => ({ ...l, error: message })),
      },
      { model: selectedModel },
    ).finally(() => setBusy(false));
  }

  function openExample(id: string) {
    const entry = HISTORY.find((h) => h.scenario.id === id);
    if (!entry) return;
    lastSyncedRef.current = id;
    setBusy(false);
    setLoadedFromHistory(false);
    setActiveThreadId(id);
    router.replace(`/app?thread=${encodeURIComponent(id)}`);
    suppressScrollRef.current = true;
    setMessages([
      { id: nextId++, role: "user", text: entry.scenario.question },
      {
        id: nextId++,
        role: "assistant",
        kind: "history",
        scenario: entry.scenario,
      },
    ]);
  }

  function openThread(id: string) {
    const base = wallet.address ? loadThreads(wallet.address) : [];
    const thread = base.find((t) => t.id === id) || threads.find((t) => t.id === id);
    if (!thread) return;
    lastSyncedRef.current = id;
    setBusy(false);
    setLoadedFromHistory(true);
    setActiveThreadId(id);
    router.replace(`/app?thread=${encodeURIComponent(id)}`);
    suppressScrollRef.current = true;
    setMessages(
      thread.messages.map((m) =>
        m.role === "user"
          ? { id: nextId++, role: "user", text: m.text }
          : { id: nextId++, role: "assistant", kind: "live", live: m.live },
      ),
    );
  }

  function newConversation() {
    lastSyncedRef.current = null;
    suppressScrollRef.current = true;
    setMessages([]);
    setActiveThreadId(null);
    setLoadedFromHistory(false);
    setBusy(false);
    setInput("");
    router.replace("/app");
  }

  function handleDeleteThread(id: string) {
    if (!wallet.address) return;
    deleteThread(wallet.address, id);
    if (activeThreadId === id) {
      newConversation();
    } else {
      // Force refresh threads state by toggling activeThreadId or updating local state
      setMessages((m) => [...m]);
    }
  }

  const locked = busy || !wallet.connected;
  const connectLabel =
    wallet.status === "connecting"
      ? "connecting..."
      : wallet.status === "signing"
        ? "confirm in wallet..."
        : wallet.status === "unavailable"
          ? "no wallet found"
          : "connect wallet";

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl">
      <HistorySidebar
        activeId={activeThreadId}
        onSelectExample={openExample}
        onSelectThread={openThread}
        onDeleteThread={handleDeleteThread}
        onNewChat={newConversation}
        threads={threads}
        walletConnected={wallet.connected}
      />

      <div className="flex h-dvh flex-1 flex-col">
        <AppHeader
          activePage="app"
          rightContent={
            <div className="flex items-center gap-2">
              {/* Sub-Agents Badge Icon Button */}

              {wallet.connected && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setDrawerTab("agents");
                    setDrawerOpen(true);
                  }}
                  title="View sub-agents & autonomous schedules"
                  className="flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  <Bot className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--accent-ink)]">
                    {wallet.address ? agentCount : 0}
                  </span>
                </motion.button>
              )}

              {/* Unified Wallet Connection Pill Cluster */}
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                {wallet.connected ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setDrawerTab("wallet");
                      setDrawerOpen(true);
                    }}
                    title="Click to view wallet details & sub-agents"
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:bg-white/10"
                  >
                    <span className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)]" />
                    <span>
                      {wallet.short} <span className="text-[10px] text-[var(--ink-faint)]">({wallet.chainLabel})</span>
                    </span>
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={wallet.connect}
                    disabled={
                      wallet.status === "connecting" ||
                      wallet.status === "signing"
                    }
                    className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3.5 py-1 text-xs font-semibold text-[var(--accent-ink)] shadow-[0_0_15px_rgba(255,180,84,0.25)] transition hover:bg-[var(--accent)]/90 disabled:opacity-50"
                  >
                    {connectLabel}
                  </motion.button>
                )}
              </div>
            </div>



          }
        />


        <div className="flex-1 overflow-y-auto px-5 py-6">
          {messages.length === 0 && <EmptyState onPick={ask} wallet={wallet} />}

          <div className="flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-end"
                >
                  <div className="max-w-[80%] rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-5 py-3 text-sm leading-relaxed text-[var(--ink)] shadow-[0_4px_20px_rgba(255,180,84,0.08)]">
                    {m.text}
                  </div>
                </motion.div>
              ) : m.kind === "history" ? (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] w-full">
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                      demo · scripted, not live
                    </div>
                    <AssistantTurn
                      scenario={m.scenario}
                      instant
                      onDone={() => {}}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] w-full">
                    <LiveAssistantTurn
                      live={m.live}
                      instant={loadedFromHistory}
                      ownerAddress={wallet.address || "0xdefault_owner"}
                    />
                  </div>
                </motion.div>
              ),
            )}
          </div>
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          {messages.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {visiblePrompts.map((s) => (
                <motion.button
                  key={s.id}
                  onClick={() => ask(s.question)}
                  disabled={locked}
                  whileHover={{ scale: locked ? 1 : 1.03, y: -2 }}
                  whileTap={{ scale: locked ? 1 : 0.97 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60 px-3.5 py-1.5 text-xs text-[var(--ink-dim)] transition-all hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s.question}
                </motion.button>
              ))}
              <motion.button
                type="button"
                onClick={() => setPromptOffset((prev) => prev + 3)}
                disabled={locked}
                whileHover={{ scale: locked ? 1 : 1.04 }}
                whileTap={{ scale: locked ? 1 : 0.96 }}
                title="Shuffle suggested questions"
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-xs text-[var(--accent)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↻ Shuffle
              </motion.button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1210]/90 backdrop-blur-xl p-2.5 shadow-2xl transition-all duration-300 focus-within:border-[var(--accent)]/60 focus-within:shadow-[0_0_30px_rgba(255,180,84,0.18)]"
          >
            <span className="ml-2 font-mono text-sm font-semibold text-[var(--accent)]">&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={locked}
              placeholder={
                !wallet.connected
                  ? "connect your wallet to ask a question"
                  : busy
                    ? "waiting for agents..."
                    : "ask about your on-chain data..."
              }
              className="flex-1 bg-transparent px-2 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-50"
            />
            {/* Model Selector Pill (Icon only, bottom right) */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 transition hover:border-white/20 hover:bg-white/10"
              title={`Active Model: ${selectedModel}`}
            >
              <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
              <select
                value={selectedModel}
                onChange={(e) =>
                  setSelectedModel(e.target.value as ModelChoice)
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Select model"
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#131313] text-[var(--ink)]">
                    {option.label}
                  </option>
                ))}
              </select>
            </motion.div>
            <motion.button
              type="submit"
              disabled={locked || !input.trim()}
              whileHover={{ scale: locked || !input.trim() ? 1 : 1.04 }}
              whileTap={{ scale: locked || !input.trim() ? 1 : 0.96 }}
              className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-[var(--accent-ink)] shadow-[0_0_15px_rgba(255,180,84,0.2)] transition-all hover:bg-[var(--accent)]/90 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-[var(--ink-faint)] disabled:shadow-none"
            >
              Run →
            </motion.button>
          </form>

        </div>
      </div>


      <AgentsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ownerAddress={wallet.address || ""}
        onAskPrompt={ask}
        onPreparePrompt={(p) => setInput(p)}
        initialTab={drawerTab}
      />


    </div>
  );
}

const CATEGORIES = [
  { id: "featured", label: "Featured" },
  { id: "portfolio", label: "Portfolio & Risk" },
  { id: "defi", label: "DeFi & Yield" },
  { id: "whales", label: "Whale Tracking" },
  { id: "agents", label: "Agents" },
  { id: "hedera", label: "Hedera & Automation" },
  { id: "all", label: "All Questions" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const FEATURED_IDS = [
  "portfolio",
  "yield-advisor",
  "whale-tracker",
  "hedera-scheduled-transfer",
];

function getScenarioCategory(
  id: string,
): "portfolio" | "defi" | "whales" | "agents" | "hedera" {
  if (["portfolio", "risk-monitor", "sprawl"].includes(id)) return "portfolio";
  if (
    [
      "yield-advisor",
      "trading",
      "saucerswap-apr",
      "saucerswap-swap",
      "uniswap-best-yield",
    ].includes(id)
  )
    return "defi";
  if (["whale-tracker"].includes(id)) return "whales";
  if (
    [
      "hedera-list-agents",
      "hedera-create-agent",
      "hedera-schedule-loop",
      "whale-copy-agent",
      "twitter-trigger-bot",
    ].includes(id)
  )
    return "agents";
  return "hedera";
}

function EmptyState({
  onPick,
  wallet,
}: {
  onPick: (q: string) => void;
  wallet: ReturnType<typeof useWallet>;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("featured");

  const visibleScenarios = useMemo(() => {
    if (activeCategory === "featured") {
      return SCENARIOS.filter((s) => FEATURED_IDS.includes(s.id));
    }
    if (activeCategory === "all") {
      return SCENARIOS;
    }
    return SCENARIOS.filter(
      (s) => getScenarioCategory(s.id) === activeCategory,
    );
  }, [activeCategory]);

  if (!wallet.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)]">
            Connect a wallet to get started
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-dim)]">
            ChainScope&apos;s agents ground every answer in your live on-chain
            activity — balances, positions, and history pulled from The Graph.
            Signing in with your wallet also keeps your questions saved for next
            time, on this device.
          </p>
        </motion.div>
        <motion.button
          onClick={wallet.connect}
          disabled={
            wallet.status === "connecting" || wallet.status === "signing"
          }
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_0_20px_rgba(255,180,84,0.3)] transition hover:bg-[var(--accent)]/90 hover:shadow-[0_0_30px_rgba(255,180,84,0.5)] disabled:cursor-wait disabled:opacity-70"
        >
          {wallet.status === "connecting"
            ? "connecting..."
            : wallet.status === "signing"
              ? "confirm in wallet..."
              : "connect wallet"}
        </motion.button>
        {wallet.status === "unavailable" && (
          <p className="max-w-sm text-xs text-[var(--ink-faint)]">
            No injected wallet was found. Install{" "}
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-2"
            >
              MetaMask
            </a>{" "}
            or another EIP-1193 wallet, then try again.
          </p>
        )}
        {wallet.error && wallet.status === "error" && (
          <p className="max-w-sm text-xs text-[var(--danger)]">
            {wallet.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 py-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)] sm:text-3xl">
          Ask ChainScope about your on-chain activity
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-dim)]">
          Specialized agents query live Graph subgraph data and analyze it in a
          Python sandbox. Select a category or prompt below to try live query.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-center justify-center gap-1.5"
      >
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`rounded-full px-3.5 py-1 text-xs transition border ${
              activeCategory === cat.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-[0_0_12px_rgba(255,180,84,0.2)]"
                : "border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            {cat.label}
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full max-w-lg flex-col gap-2.5 max-h-[360px] overflow-y-auto px-1 py-1 rounded-2xl border border-[var(--border)]/40 bg-[var(--bg-raised)]/40 backdrop-blur-md"
      >
        {visibleScenarios.map((s) => (
          <motion.button
            key={s.id}
            onClick={() => onPick(s.question)}
            whileHover={{
              y: -3,
              scale: 1.015,
              borderColor: "rgba(255, 180, 84, 0.4)",
              boxShadow: "0 12px 28px -6px rgba(0, 0, 0, 0.5), 0 0 16px -2px rgba(255, 180, 84, 0.15)",
              backgroundColor: "rgba(13, 18, 16, 0.95)",
            }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="group flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/70 px-4 py-3 text-left text-sm text-[var(--ink-dim)] transition-colors cursor-pointer"
          >
            <span>
              <span className="mr-2 text-[10px] font-mono uppercase tracking-wider text-[var(--accent)]/80 font-medium">
                {s.agent}
              </span>
              <br className="hidden sm:block" />
              <span className="text-[var(--ink)] font-medium group-hover:text-[var(--accent)] transition-colors">
                {s.question}
              </span>
            </span>
            <span className="shrink-0 pl-3 text-[var(--ink-faint)] transition-transform duration-300 group-hover:translate-x-1.5 group-hover:text-[var(--accent)] font-semibold">
              →
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

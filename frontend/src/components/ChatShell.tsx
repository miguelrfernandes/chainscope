"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SCENARIOS, HISTORY, type Scenario } from "@/lib/scenarios";
import { streamChat } from "@/lib/api";
import { deleteThread, loadThreads, saveThread, type StoredThread } from "@/lib/history";
import { useWallet } from "@/hooks/useWallet";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { AssistantTurn } from "./AssistantTurn";
import { LiveAssistantTurn, type LiveState } from "./LiveAssistantTurn";
import { Logomark } from "./Logomark";
import { HistorySidebar } from "./HistorySidebar";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; kind: "history"; scenario: Scenario | null }
  | { id: number; role: "assistant"; kind: "live"; live: LiveState };

let nextId = 1;

function newThreadId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const EXAMPLE_IDS = new Set(SCENARIOS.map((s) => s.id));

export function ChatShell() {
  const wallet = useWallet();
  const hederaWallet = useHederaWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [promptOffset, setPromptOffset] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);

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
      (m): m is Extract<Message, { role: "user" } | { role: "assistant"; kind: "live" }> =>
        m.role === "user" || (m.role === "assistant" && m.kind === "live")
    );
    if (relevant.length === 0) return null;
    const firstUser = relevant.find((m): m is Extract<Message, { role: "user" }> => m.role === "user");
    if (!firstUser) return null;
    return {
      id: activeThreadId,
      title: firstUser.text,
      updatedAt,
      messages: relevant.map((m) =>
        m.role === "user" ? { role: "user", text: m.text } : { role: "assistant", live: m.live }
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

  function updateLive(id: number, updater: (live: LiveState) => LiveState) {
    setMessages((msgs) =>
      msgs.map((m) =>
        m.id === id && m.role === "assistant" && m.kind === "live"
          ? { ...m, live: updater(m.live) }
          : m
      )
    );
  }

  function ask(question: string) {
    if (busy || !wallet.connected || !question.trim()) return;
    const q = question.trim();
    const threadId = activeThreadId && !EXAMPLE_IDS.has(activeThreadId) ? activeThreadId : newThreadId();
    const assistantId = nextId++;

    setActiveThreadId(threadId);
    setLoadedFromHistory(false);
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: nextId++, role: "user", text: q },
      {
        id: assistantId,
        role: "assistant",
        kind: "live",
        live: { steps: [], answer: null, sources: [], artifacts: [], error: null },
      },
    ]);
    setInput("");

    let promptWithWallet = wallet.address && !q.toLowerCase().includes(wallet.address.toLowerCase())
      ? `${q}\n(Connected wallet: ${wallet.address})`
      : q;
    if (hederaWallet.accountId && !promptWithWallet.includes(hederaWallet.accountId)) {
      promptWithWallet += `\n(Connected Hedera wallet: ${hederaWallet.accountId})`;
    }

    streamChat(threadId, promptWithWallet, {
      onStep: (step) =>
        updateLive(assistantId, (l) => ({ ...l, steps: [...l.steps, step] })),
      onAnswer: (payload) =>
        updateLive(assistantId, (l) => ({
          ...l,
          answer: payload.answer,
          sources: payload.sources,
          artifacts: payload.artifacts,
        })),
      onError: (message) => updateLive(assistantId, (l) => ({ ...l, error: message })),
    }).finally(() => setBusy(false));
  }

  function openExample(id: string) {
    const entry = HISTORY.find((h) => h.scenario.id === id);
    if (!entry) return;
    setBusy(false);
    setLoadedFromHistory(false);
    setActiveThreadId(id);
    suppressScrollRef.current = true;
    setMessages([
      { id: nextId++, role: "user", text: entry.scenario.question },
      { id: nextId++, role: "assistant", kind: "history", scenario: entry.scenario },
    ]);
  }

  function openThread(id: string) {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;
    setBusy(false);
    setLoadedFromHistory(true);
    setActiveThreadId(id);
    suppressScrollRef.current = true;
    setMessages(
      thread.messages.map((m) =>
        m.role === "user"
          ? { id: nextId++, role: "user", text: m.text }
          : { id: nextId++, role: "assistant", kind: "live", live: m.live }
      )
    );
  }

  function newConversation() {
    suppressScrollRef.current = true;
    setMessages([]);
    setActiveThreadId(null);
    setLoadedFromHistory(false);
    setBusy(false);
    setInput("");
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
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <button
            onClick={newConversation}
            title="Start a new conversation"
            className="flex items-center gap-2 transition hover:opacity-80"
          >
            <Logomark className="h-6 w-6 text-[var(--accent)]" />
            <span className="text-lg leading-none">
              <span className="font-[family-name:var(--font-display)] italic text-[var(--ink)]">
                Chain
              </span>
              <span className="font-medium tracking-wide text-[var(--accent)]">
                Scope
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            {wallet.error && (
              <span className="hidden max-w-56 truncate text-[11px] text-[var(--danger)] sm:inline">
                {wallet.error}
              </span>
            )}
            {wallet.connected ? (
              <button
                onClick={wallet.disconnect}
                title="Disconnect"
                className="group flex items-center gap-2 border border-[var(--border)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--danger)]/50"
              >
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent), var(--success))",
                  }}
                />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[var(--ink)] group-hover:hidden">
                    {wallet.short}
                  </span>
                  <span className="hidden text-[var(--danger)] group-hover:inline">
                    disconnect
                  </span>
                  <span className="text-[var(--ink-faint)]">{wallet.chainLabel}</span>
                </span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
              </button>
            ) : (
              <button
                onClick={wallet.connect}
                disabled={wallet.status === "connecting" || wallet.status === "signing"}
                className="flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
                {connectLabel}
              </button>
            )}

            {hederaWallet.connected ? (
              <button
                onClick={hederaWallet.disconnect}
                title="Disconnect Hedera wallet"
                className="group flex items-center gap-2 border border-[var(--border)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--danger)]/50"
              >
                <span className="text-[var(--ink)] group-hover:hidden">{hederaWallet.accountId}</span>
                <span className="hidden text-[var(--danger)] group-hover:inline">disconnect</span>
              </button>
            ) : (
              <button
                onClick={hederaWallet.connect}
                disabled={hederaWallet.status === "connecting"}
                title="Connect Hedera wallet via WalletConnect (HashPack, Kabila, etc.) for Hedera actions"
                className="flex items-center gap-2 border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 disabled:cursor-wait disabled:opacity-70"
              >
                {hederaWallet.status === "connecting" ? "connecting…" : "connect Hedera (WalletConnect)"}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {messages.length === 0 && (
            <EmptyState onPick={ask} wallet={wallet} />
          )}

          <div className="flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="animate-fade-up flex justify-end">
                  <div className="max-w-[80%] border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2.5 text-sm text-[var(--ink)]">
                    {m.text}
                  </div>
                </div>
              ) : m.kind === "history" ? (
                <div key={m.id} className="animate-fade-up flex justify-start">
                  <div className="max-w-[85%] w-full">
                    <div className="mb-2 inline-flex items-center gap-1.5 border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      demo · scripted, not live
                    </div>
                    <AssistantTurn scenario={m.scenario} instant onDone={() => {}} />
                  </div>
                </div>
              ) : (
                <div key={m.id} className="animate-fade-up flex justify-start">
                  <div className="max-w-[85%] w-full">
                    <LiveAssistantTurn
                      live={m.live}
                      instant={loadedFromHistory}
                      ownerAddress={wallet.address || "0xdefault_owner"}
                    />
                  </div>
                </div>
              )
            )}
          </div>
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          {messages.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {visiblePrompts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => ask(s.question)}
                  disabled={locked}
                  className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s.question}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPromptOffset((prev) => prev + 3)}
                disabled={locked}
                title="Shuffle suggested questions"
                className="border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-1.5 text-xs text-[var(--accent)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↻ Shuffle
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2"
          >
            <span className="text-[var(--accent)]">&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={locked}
              placeholder={
                !wallet.connected
                  ? "connect your wallet to ask a question"
                  : busy
                    ? "waiting for agents..."
                    : "ask about your on-chain data"
              }
              className="flex-1 border-b border-[var(--border)] bg-transparent px-1 py-2.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={locked || !input.trim()}
              className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-transparent disabled:text-[var(--ink-faint)]"
            >
              run
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = [
  { id: "featured", label: "Featured" },
  { id: "portfolio", label: "Portfolio & Risk" },
  { id: "defi", label: "DeFi & Yield" },
  { id: "hedera", label: "Hedera & Automation" },
  { id: "all", label: "All Questions" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const FEATURED_IDS = ["portfolio", "yield-advisor", "hedera-scheduled-transfer"];

function getScenarioCategory(id: string): "portfolio" | "defi" | "hedera" {
  if (["portfolio", "risk-monitor", "sprawl"].includes(id)) return "portfolio";
  if (["yield-advisor", "trading", "saucerswap-apr", "saucerswap-swap"].includes(id)) return "defi";
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
    return SCENARIOS.filter((s) => getScenarioCategory(s.id) === activeCategory);
  }, [activeCategory]);

  if (!wallet.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="animate-fade-up">
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)]">
            Connect a wallet to get started
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-dim)]">
            ChainScope&apos;s agents ground every answer in your live on-chain
            activity — balances, positions, and history pulled from The
            Graph. Signing in with your wallet also keeps your questions
            saved for next time, on this device.
          </p>
        </div>
        <button
          onClick={wallet.connect}
          disabled={wallet.status === "connecting" || wallet.status === "signing"}
          className="animate-fade-up border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          style={{ animationDelay: "120ms" }}
        >
          {wallet.status === "connecting"
            ? "connecting..."
            : wallet.status === "signing"
              ? "confirm in wallet..."
              : "connect wallet"}
        </button>
        {wallet.status === "unavailable" && (
          <p className="animate-fade-up max-w-sm text-xs text-[var(--ink-faint)]">
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
          <p className="animate-fade-up max-w-sm text-xs text-[var(--danger)]">{wallet.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 py-4 text-center">
      <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)]">
          Ask ChainScope about your on-chain activity
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--ink-dim)]">
          Specialized agents query live Graph subgraph data and analyze it in
          a Python sandbox. Select a category or prompt below to try live query.
        </p>
      </div>

      <div
        className="animate-fade-up flex flex-wrap items-center justify-center gap-1.5"
        style={{ animationDelay: "60ms" }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 text-xs transition border ${
              activeCategory === cat.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                : "border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-md flex-col gap-2 max-h-[320px] overflow-y-auto px-1 py-0.5 border border-[var(--border)]/40 bg-[var(--bg-raised)]/30">
        {visibleScenarios.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onPick(s.question)}
            style={{ animationDelay: `${120 + i * 60}ms` }}
            className="animate-fade-up group flex items-center justify-between border border-[var(--border)] bg-[var(--bg-raised)]/60 px-3.5 py-2.5 text-left text-sm text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
          >
            <span>
              <span className="mr-2 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                {s.agent}
              </span>
              <br className="hidden sm:block" />
              {s.question}
            </span>
            <span className="shrink-0 pl-3 text-[var(--ink-faint)] transition group-hover:text-[var(--accent)]">
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

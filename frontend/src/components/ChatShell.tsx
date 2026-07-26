"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Cpu, Bot, Bell, ChevronDown } from "lucide-react";

import { SCENARIOS, HISTORY, type Scenario } from "@/lib/scenarios";
import { streamChat } from "@/lib/api";
import type { ConversationTurn, SuggestionItem } from "@/lib/api";
import {
  deleteThread,
  loadThreads,
  saveThread,
  type StoredThread,
} from "@/lib/history";
import { useWallet } from "@/hooks/useWallet";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { useSuggestions } from "@/hooks/useSuggestions";
import { useAgentCount } from "@/hooks/useAgentCount";
import { useAlertCount } from "@/hooks/useAlertCount";
import { AssistantTurn } from "./AssistantTurn";
import { LiveAssistantTurn, type LiveState } from "./LiveAssistantTurn";
import { HistorySidebar } from "./HistorySidebar";
import { AgentsDrawer } from "./AgentsDrawer";
import { AppHeader } from "./AppHeader";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "scenario"; scenario: Scenario }
  | { id: string; role: "assistant"; kind: "live"; live: LiveState };

type ModelChoice = "chainscope" | "0g";

const MODEL_OPTIONS: Array<{
  value: string;
  label: string;
  disabled?: boolean;
}> = [
  { value: "chainscope", label: "ChainScope (gpt-4o-mini)" },
  { value: "0g", label: "0G Compute (qwen2.5-omni)" },
  {
    value: "claude-opus-5",
    label: "ChainScope (Claude Opus 5)",
    disabled: true,
  },
  { value: "kimi-k3", label: "ChainScope (Kimi K3)", disabled: true },
  { value: "gpt-5.6-sol", label: "ChainScope (GTP-5.6 Sol)", disabled: true },
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
  const [drawerTab, setDrawerTab] = useState<
    "wallet" | "agents" | "schedules" | "alerts"
  >("wallet");

  const ownerAddress = wallet.address || hederaWallet.accountId || null;
  const agentCount = useAgentCount(ownerAddress, [drawerOpen, messages]);
  const alertCount = useAlertCount(wallet.address, [drawerOpen, messages]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);
  const lastSyncedRef = useRef<string | null>(null);
  const prevHistoryAddressRef = useRef<string | null | undefined>(undefined);

  const visiblePrompts = useMemo(() => {
    const total = SCENARIOS.length;
    return [
      SCENARIOS[promptOffset % total],
      SCENARIOS[(promptOffset + 1) % total],
      SCENARIOS[(promptOffset + 2) % total],
    ];
  }, [promptOffset]);

  // Build conversation turns for suggestions (only live turns, not demo scenarios).
  // Truncated to keep token usage low: last 6 turns, user msgs ≤300 chars, answers ≤600 chars.
  const suggestionTurns = useMemo((): ConversationTurn[] => {
    if (messages.length === 0) return [];
    const result: ConversationTurn[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        const text = m.text.length > 300 ? m.text.slice(0, 300) + "…" : m.text;
        result.push({ role: "user", text });
      } else if (m.role === "assistant" && m.kind === "live" && m.live.answer) {
        const ans = m.live.answer;
        const text = ans.length > 600 ? ans.slice(0, 600) + "…" : ans;
        result.push({ role: "assistant", text });
      }
    }
    // Only send the last 6 turns (3 exchanges) to keep context focused
    return result.slice(-6);
  }, [messages]);

  const dynamicSuggestions = useSuggestions(suggestionTurns, activeThreadId);

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

  const historyAddress = ownerAddress;

  // Sidebar list: saved threads from local storage, sorted by updatedAt
  const threads = useMemo(() => {
    const base = historyAddress ? loadThreads(historyAddress) : [];
    const saved = base.find((t) => t.id === activeThreadId);
    const timestamp = saved ? saved.updatedAt : 0;
    const live = activeThreadSnapshot(timestamp);
    if (!live) return base;
    return base.map((t) => (t.id === live.id ? live : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAddress, activeThreadId, messages]);

  // Persist the active conversation to this wallet's local history whenever it changes.
  // Also guards against a wallet switch: if the connected address changed since the
  // last run, the in-memory conversation belongs to the *previous* wallet, so we clear
  // it instead of leaking it into (or reading it from) the new wallet's history.
  useEffect(() => {
    const addressChanged =
      prevHistoryAddressRef.current !== undefined &&
      prevHistoryAddressRef.current !== historyAddress;
    prevHistoryAddressRef.current = historyAddress;

    if (addressChanged) {
      lastSyncedRef.current = null;
      setMessages([]);
      setActiveThreadId(null);
      setLoadedFromHistory(false);
      setBusy(false);
      setInput("");
      router.replace("/app");
      return;
    }

    if (!historyAddress) return;
    const base = loadThreads(historyAddress);
    const saved = base.find((t) => t.id === activeThreadId);
    const snapshot = activeThreadSnapshot(saved ? saved.updatedAt : Date.now());
    if (!snapshot) return;
    saveThread(historyAddress, snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeThreadId, historyAddress]);

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

    if (historyAddress) {
      const stored = loadThreads(historyAddress);
      if (stored.some((t) => t.id === threadParam)) {
        lastSyncedRef.current = threadParam;
        openThread(threadParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, historyAddress]);

  function genId(): string {
    return String(nextId++);
  }

  function updateLive(id: string, updater: (live: LiveState) => LiveState) {
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
    const assistantId = genId();

    lastSyncedRef.current = threadId;
    setActiveThreadId(threadId);
    router.replace(`/app?thread=${encodeURIComponent(threadId)}`);
    setLoadedFromHistory(false);
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: genId(), role: "user", text: q },
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

    let promptWithWallet = wallet.address
      ? `${q}\n(Note: if this question is about "my"/"me", the user's connected wallet is ${wallet.address})`
      : q;
    if (hederaWallet.accountId) {
      promptWithWallet += `\n(Note: if this question is about "my"/"me", the user's connected Hedera wallet is ${hederaWallet.accountId})`;
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
      { id: genId(), role: "user", text: entry.scenario.question },
      {
        id: genId(),
        role: "assistant",
        kind: "scenario",
        scenario: entry.scenario,
      },
    ]);
  }

  function openThread(id: string) {
    const base = historyAddress ? loadThreads(historyAddress) : [];
    const thread =
      base.find((t) => t.id === id) || threads.find((t) => t.id === id);
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
          ? { id: genId(), role: "user", text: m.text }
          : { id: genId(), role: "assistant", kind: "live", live: m.live },
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
    if (!historyAddress) return;
    deleteThread(historyAddress, id);
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
    <div className="mx-auto flex h-dvh w-full max-w-6xl overflow-x-hidden">
      <HistorySidebar
        activeId={activeThreadId}
        onSelectExample={openExample}
        onSelectThread={openThread}
        onDeleteThread={handleDeleteThread}
        onNewChat={newConversation}
        threads={threads}
        walletConnected={wallet.connected || hederaWallet.connected}
      />

      <div className="flex h-dvh flex-1 flex-col overflow-x-hidden">
        <AppHeader
          activePage="app"
          rightContent={
            <div className="flex items-center gap-2">
              {wallet.connected && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setDrawerTab("alerts");
                      setDrawerOpen(true);
                    }}
                    title="View scheduled question alerts & inbox"
                    className="flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/20"
                  >
                    <Bell className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--accent-ink)]">
                      {wallet.address ? alertCount : 0}
                    </span>
                  </motion.button>
                </>
              )}

              {ownerAddress && (
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
                    {agentCount}
                  </span>
                </motion.button>
              )}

              {wallet.connected || hederaWallet.connected ? (
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                  {wallet.connected && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={wallet.disconnect}
                      title="Click to disconnect EVM wallet"
                      className="flex items-center gap-1.5 rounded-full border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-1 text-xs font-medium text-[var(--success)] font-mono transition hover:border-[var(--danger)]/50 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                      {wallet.address
                        ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                        : "EVM connected"}
                    </motion.button>
                  )}

                  {hederaWallet.connected && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={hederaWallet.disconnect}
                      title="Click to disconnect Hedera wallet"
                      className="flex items-center gap-1.5 rounded-full border border-[#00ea90]/40 bg-[#00ea90]/10 px-3 py-1 text-xs font-medium text-[#00ea90] font-mono transition hover:border-[var(--danger)]/50 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#00ea90] animate-pulse" />
                      {hederaWallet.accountId
                        ? `ħ ${hederaWallet.accountId}`
                        : "ħ Hedera connected"}
                    </motion.button>
                  )}
                </div>
              ) : (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center overflow-hidden rounded-full border border-transparent bg-[var(--accent)] shadow-[0_0_12px_rgba(255,180,84,0.2)] transition hover:border-[var(--accent-ink)]/40"
                >
                  <button
                    onClick={wallet.connect}
                    disabled={
                      wallet.status === "connecting" ||
                      wallet.status === "signing"
                    }
                    className="bg-[var(--accent)] py-1.5 pl-3.5 pr-2 text-xs font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/90 disabled:opacity-60"
                  >
                    {connectLabel}
                  </button>

                  <Dropdown
                    placement="bottom-end"
                    classNames={{
                      content:
                        "min-w-[220px] rounded-xl border border-white/10 bg-[var(--bg-raised)] p-1 shadow-xl",
                    }}
                  >
                    <DropdownTrigger>
                      <button
                        type="button"
                        title="Other wallet options"
                        className="flex items-center self-stretch border-l border-[var(--accent-ink)]/25 bg-[var(--accent)] px-2 text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/80"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Wallet options"
                      onAction={(key) => {
                        if (key === "evm") wallet.connect();
                        if (key === "hedera") hederaWallet.connect();
                      }}
                      itemClasses={{
                        base: "rounded-lg text-[var(--ink)] data-[hover=true]:bg-white/10 data-[hover=true]:text-[var(--ink)]",
                        description: "text-[var(--ink-dim)]",
                      }}
                    >
                      <DropdownItem
                        key="evm"
                        isDisabled={
                          wallet.status === "connecting" ||
                          wallet.status === "signing"
                        }
                        description="Connect via MetaMask or another injected wallet"
                      >
                        {wallet.status === "connecting"
                          ? "connecting..."
                          : wallet.status === "signing"
                            ? "confirm in wallet..."
                            : "Connect EVM Wallet (default)"}
                      </DropdownItem>
                      <DropdownItem
                        key="hedera"
                        isDisabled={hederaWallet.status === "connecting"}
                        description="Connect via WalletConnect (HashPack)"
                      >
                        {hederaWallet.status === "connecting"
                          ? "ħ connecting..."
                          : "ħ Connect Hedera"}
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </motion.div>
              )}
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 py-6">
          {messages.length === 0 && (
            <EmptyState
              onPick={ask}
              wallet={wallet}
              hederaWallet={hederaWallet}
            />
          )}

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
              ) : m.kind === "scenario" ? (
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
                      onUpdateLive={(updatedLive) => {
                        updateLive(m.id, () => updatedLive);
                      }}
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
              {suggestionTurns.length > 0
                ? // Dynamic AI-generated follow-up suggestions (questions or actions)
                  dynamicSuggestions === null
                  ? // Loading skeleton
                    [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-7 w-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60"
                      />
                    ))
                  : dynamicSuggestions.length > 0
                    ? dynamicSuggestions.map(
                        (item: SuggestionItem, i: number) =>
                          item.type === "action" ? (
                            <motion.button
                              key={i}
                              onClick={() => ask(item.prompt)}
                              disabled={locked}
                              whileHover={{ scale: locked ? 1 : 1.04, y: -2 }}
                              whileTap={{ scale: locked ? 1 : 0.96 }}
                              transition={{
                                duration: 0.25,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="flex items-center gap-1.5 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent)] shadow-[0_0_12px_rgba(255,180,84,0.12)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/20 hover:shadow-[0_0_20px_rgba(255,180,84,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="text-[10px]">⚡</span>
                              {item.label}
                              <span className="text-[var(--accent)]/70">→</span>
                            </motion.button>
                          ) : (
                            <motion.button
                              key={i}
                              onClick={() => ask(item.prompt)}
                              disabled={locked}
                              whileHover={{ scale: locked ? 1 : 1.03, y: -2 }}
                              whileTap={{ scale: locked ? 1 : 0.97 }}
                              transition={{
                                duration: 0.25,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)]/60 px-3.5 py-1.5 text-xs text-[var(--ink-dim)] transition-all hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {item.label}
                            </motion.button>
                          ),
                      )
                    : null
                : // Static template prompts when viewing a demo / no live answer yet
                  visiblePrompts.map((s) => (
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
              {suggestionTurns.length === 0 && (
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
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1210]/90 backdrop-blur-xl p-2.5 shadow-2xl transition-all duration-300 focus-within:border-[var(--accent)]/60 focus-within:shadow-[0_0_30px_rgba(255,180,84,0.18)]"
          >
            <span className="ml-2 font-mono text-sm font-semibold text-[var(--accent)]">
              &gt;
            </span>
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
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={`bg-[#131313] ${option.disabled ? "text-neutral-500 font-normal opacity-50" : "text-[var(--ink)]"}`}
                  >
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
        ownerAddress={ownerAddress || ""}
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
  hederaWallet,
}: {
  onPick: (q: string) => void;
  wallet: ReturnType<typeof useWallet>;
  hederaWallet: ReturnType<typeof useHederaWallet>;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("featured");

  const visibleScenarios = useMemo(() => {
    if (activeCategory === "featured") {
      return SCENARIOS.filter((s) => FEATURED_IDS.includes(s.id));
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
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center overflow-hidden rounded-full border border-[var(--accent)] shadow-[0_0_20px_rgba(255,180,84,0.3)]"
        >
          <button
            onClick={wallet.connect}
            disabled={
              wallet.status === "connecting" || wallet.status === "signing"
            }
            className="bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/90 disabled:cursor-wait disabled:opacity-70"
          >
            {wallet.status === "connecting"
              ? "connecting..."
              : wallet.status === "signing"
                ? "confirm in wallet..."
                : "connect wallet"}
          </button>

          <Dropdown
            placement="bottom-end"
            classNames={{
              content:
                "min-w-[220px] rounded-xl border border-white/10 bg-[var(--bg-raised)] p-1 shadow-xl",
            }}
          >
            <DropdownTrigger>
              <button
                type="button"
                title="Other wallet options"
                className="flex h-full items-center self-stretch border-l border-[var(--accent-ink)]/20 bg-[var(--accent)] px-2 py-2.5 text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/90"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Wallet options"
              onAction={(key) => {
                if (key === "evm") wallet.connect();
                if (key === "hedera") hederaWallet.connect();
              }}
              itemClasses={{
                base: "rounded-lg text-[var(--ink)] data-[hover=true]:bg-white/10 data-[hover=true]:text-[var(--ink)]",
                description: "text-[var(--ink-dim)]",
              }}
            >
              <DropdownItem
                key="evm"
                isDisabled={
                  wallet.status === "connecting" || wallet.status === "signing"
                }
                description="Connect via MetaMask or another injected wallet"
              >
                {wallet.status === "connecting"
                  ? "connecting..."
                  : wallet.status === "signing"
                    ? "confirm in wallet..."
                    : "Connect EVM Wallet (default)"}
              </DropdownItem>
              <DropdownItem
                key="hedera"
                isDisabled={hederaWallet.status === "connecting"}
                description="Connect via WalletConnect (HashPack)"
              >
                {hederaWallet.status === "connecting"
                  ? "ħ connecting..."
                  : "ħ Connect Hedera"}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </motion.div>
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
        className="flex w-full max-w-lg flex-col gap-2.5 max-h-[360px] overflow-y-auto overflow-x-hidden custom-scrollbar px-1 py-1 rounded-2xl border border-[var(--border)]/40 bg-[var(--bg-raised)]/40 backdrop-blur-md"
      >
        {visibleScenarios.map((s) => (
          <motion.button
            key={s.id}
            onClick={() => onPick(s.question)}
            whileHover={{
              y: -3,
              scale: 1.015,
              borderColor: "rgba(255, 180, 84, 0.4)",
              boxShadow:
                "0 12px 28px -6px rgba(0, 0, 0, 0.5), 0 0 16px -2px rgba(255, 180, 84, 0.15)",
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

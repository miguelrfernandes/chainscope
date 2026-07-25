"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNT, SCENARIOS, HISTORY, type Scenario } from "@/lib/scenarios";
import { streamChat } from "@/lib/api";
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

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (busy || !connected || !question.trim()) return;
    const q = question.trim();
    const threadId = activeThreadId ?? newThreadId();
    const assistantId = nextId++;

    setActiveThreadId(threadId);
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

    streamChat(threadId, q, {
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

  function openHistory(id: string) {
    const entry = HISTORY.find((h) => h.scenario.id === id);
    if (!entry) return;
    setBusy(false);
    setActiveThreadId(id);
    setMessages([
      { id: nextId++, role: "user", text: entry.scenario.question },
      { id: nextId++, role: "assistant", kind: "history", scenario: entry.scenario },
    ]);
  }

  function newConversation() {
    setMessages([]);
    setActiveThreadId(null);
    setBusy(false);
    setInput("");
  }

  const locked = busy || !connected;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl">
      <HistorySidebar
        activeId={activeThreadId}
        onSelect={openHistory}
        onNewChat={newConversation}
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

          {connected ? (
            <button
              onClick={() => setConnected(false)}
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
                  {ACCOUNT.short}
                </span>
                <span className="hidden text-[var(--danger)] group-hover:inline">
                  disconnect
                </span>
                <span className="text-[var(--ink-faint)]">
                  {ACCOUNT.chains.join(" + ")}
                </span>
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
            </button>
          ) : (
            <button
              onClick={() => setConnected(true)}
              className="flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
              connect wallet
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {messages.length === 0 && (
            <EmptyState onPick={ask} connected={connected} onConnect={() => setConnected(true)} />
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
                    <AssistantTurn scenario={m.scenario} instant onDone={() => {}} />
                  </div>
                </div>
              ) : (
                <div key={m.id} className="animate-fade-up flex justify-start">
                  <div className="max-w-[85%] w-full">
                    <LiveAssistantTurn live={m.live} />
                  </div>
                </div>
              )
            )}
          </div>
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          {messages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => ask(s.question)}
                  disabled={locked}
                  className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s.question}
                </button>
              ))}
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
                !connected
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

function EmptyState({
  onPick,
  connected,
  onConnect,
}: {
  onPick: (q: string) => void;
  connected: boolean;
  onConnect: () => void;
}) {
  if (!connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="animate-fade-up">
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)]">
            Connect a wallet to get started
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-dim)]">
            ChainScope's agents ground every answer in your live on-chain
            activity — balances, positions, and history pulled from The
            Graph.
          </p>
        </div>
        <button
          onClick={onConnect}
          className="animate-fade-up border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85"
          style={{ animationDelay: "120ms" }}
        >
          connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-12 text-center">
      <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--ink)]">
          Ask ChainScope about your on-chain activity
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-dim)]">
          Specialized agents query live Graph subgraph data and analyze it in
          a Python sandbox. This build has scripted questions so you can
          click through the intended experience.
        </p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-2">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onPick(s.question)}
            style={{ animationDelay: `${120 + i * 90}ms` }}
            className="animate-fade-up group flex items-center justify-between border border-[var(--border)] bg-[var(--bg-raised)]/60 px-4 py-3 text-left text-sm text-[var(--ink-dim)] opacity-0 transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
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

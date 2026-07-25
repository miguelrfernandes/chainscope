"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, type Scenario } from "@/lib/scenarios";
import { AssistantTurn } from "./AssistantTurn";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; scenario: Scenario | null };

let nextId = 1;

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(question: string) {
    if (busy || !question.trim()) return;
    const scenario =
      SCENARIOS.find(
        (s) => s.question.toLowerCase() === question.trim().toLowerCase()
      ) ?? null;

    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: nextId++, role: "user", text: question.trim() },
      { id: nextId++, role: "assistant", scenario },
    ]);
    setInput("");
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12h4l3 8 4-16 3 8h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-semibold tracking-tight">ChainScope</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 && <EmptyState onPick={ask} />}

        <div className="flex flex-col gap-6">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-violet-600 px-4 py-2.5 text-sm text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[85%]">
                  <AssistantTurn
                    scenario={m.scenario}
                    onDone={() => setBusy(false)}
                  />
                </div>
              </div>
            )
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        {messages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => ask(s.question)}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              busy ? "Waiting for agents to respond..." : "Ask about your on-chain data..."
            }
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-violet-400/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-12 text-center">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Ask ChainScope about your on-chain activity
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-white/50">
          Specialized agents query live Graph subgraph data and analyze it in
          a Python sandbox. This build has 3 scripted questions so you can
          click through the intended experience.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-md">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.question)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-white/80 transition hover:border-violet-400/40 hover:bg-white/[0.06]"
          >
            {s.question}
          </button>
        ))}
      </div>
    </div>
  );
}

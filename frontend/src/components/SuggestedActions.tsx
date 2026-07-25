"use client";

import { useState } from "react";
import type { ScenarioAction } from "@/lib/scenarios";

type TxState = "idle" | "confirming" | "pending" | "done";

const HEX = "0123456789abcdef";

function fakeTxHash() {
  let hash = "0x";
  for (let i = 0; i < 64; i++) hash += HEX[Math.floor(Math.random() * 16)];
  return hash;
}

export function SuggestedActions({ actions }: { actions: ScenarioAction[] }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          Suggested actions
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">
          simulated — no funds move
        </p>
      </div>
      <div className="flex flex-col divide-y divide-[var(--border-soft)]">
        {actions.map((a) => (
          <ActionRow key={a.id} action={a} />
        ))}
      </div>
    </div>
  );
}

function ActionRow({ action }: { action: ScenarioAction }) {
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState("");

  function run() {
    if (state !== "idle") return;
    setState("confirming");
    setTimeout(() => {
      setState("pending");
      setTimeout(() => {
        setHash(fakeTxHash());
        setState("done");
      }, 1100);
    }, 900);
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--ink)]">{action.label}</span>
          {action.value && (
            <span className="text-xs tabular-nums text-[var(--success)]">
              {action.value}
            </span>
          )}
        </div>
        <p className="max-w-md text-xs text-[var(--ink-faint)]">{action.description}</p>
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          {action.protocol}
        </span>
      </div>

      {state === "done" ? (
        <a
          href={`https://etherscan.io/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
        >
          ✓ confirmed · {hash.slice(0, 10)}…
        </a>
      ) : (
        <button
          onClick={run}
          disabled={state !== "idle"}
          className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "idle" && action.cta}
          {state === "confirming" && "confirm in wallet…"}
          {state === "pending" && "broadcasting…"}
        </button>
      )}
    </div>
  );
}

"use client";

import React from "react";
import { useTxSequence, type TxStep } from "@/hooks/useTxSequence";
import { shortenAddressInText, type EthereumProvider } from "@/lib/wallet";

export type ChainStrategy = {
  ensureChain: (provider: EthereumProvider) => Promise<void>;
  explorerTxUrl: (hash: string, index: number) => string;
  explorerLabel?: (stepLabel: string | undefined, index: number) => string;
};

export type ActionCardProps = {
  strategy: ChainStrategy;
  eyebrow: string;
  subtitle: string;
  idleLabel?: string;
  humanMessage?: string;
  steps: TxStep[];
  switchingLabel?: string;
  children?: React.ReactNode;
};

export function ActionCard({
  strategy,
  eyebrow,
  subtitle,
  idleLabel,
  humanMessage,
  steps,
  switchingLabel,
  children,
}: ActionCardProps) {
  const { state, stepIndex, hashes, error, run } = useTxSequence({
    steps,
    ensureChain: strategy.ensureChain,
  });

  const isPending = state === "switching" || state === "confirming" || state === "broadcasting";
  const defaultIdle = steps.length > 1 ? "Execute Sequence" : "Send Transaction";

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50 text-[var(--ink)]">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          {eyebrow}
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {children ? (
            children
          ) : (
            <>
              {humanMessage && (
                <p className="text-sm text-[var(--ink)] break-words">{humanMessage}</p>
              )}
              {steps.length > 1 && (
                <p className="text-xs text-[var(--ink-faint)]">
                  {steps.length} sequential transactions to execute
                </p>
              )}
            </>
          )}
        </div>

        {state === "done" ? (
          <div className="flex shrink-0 flex-col items-end gap-1 max-w-full min-w-0">
            {hashes.map((h, i) => {
              const defaultLabel =
                steps.length === 1
                  ? "view on explorer"
                  : steps[i]?.label
                  ? shortenAddressInText(steps[i].label)
                  : `step ${i + 1}`;
              const labelText = strategy.explorerLabel
                ? strategy.explorerLabel(steps[i]?.label, i)
                : defaultLabel;
              return (
                <a
                  key={h}
                  href={strategy.explorerTxUrl(h, i)}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full truncate border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
                >
                  ✓ {labelText} · {h.slice(0, 10)}…
                </a>
              );
            })}
          </div>
        ) : (
          <button
            onClick={run}
            disabled={isPending}
            className="max-w-full shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-right text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70 sm:max-w-[55%]"
          >
            {state === "idle" && (idleLabel || defaultIdle)}
            {state === "switching" && (switchingLabel ?? "switching network…")}
            {state === "confirming" &&
              `confirm in wallet — ${steps[stepIndex]?.label ?? `step ${stepIndex + 1}`}…`}
            {state === "broadcasting" && "broadcasting…"}
            {state === "error" && "retry"}
          </button>
        )}
      </div>

      {error && (
        <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

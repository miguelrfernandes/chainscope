"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { ensureHederaTestnet, getEthereumProvider, sendTransaction, shortenAddressInText } from "@/lib/wallet";

export type HederaEvmStep = {
  label?: string;
  to: string;
  data: string;
  value: string;
};

export type HederaEvmActionPayload = {
  human_message: string;
  to?: string;
  value?: string;
  data?: string;
  steps?: HederaEvmStep[];
};

type RunState = "idle" | "switching" | "confirming" | "broadcasting" | "done" | "error";

export function HederaEvmActionCard({ payload }: { payload: HederaEvmActionPayload }) {
  const wallet = useWallet();
  const [state, setState] = useState<RunState>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [hashes, setHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const steps: HederaEvmStep[] =
    payload.steps && payload.steps.length > 0
      ? payload.steps
      : payload.to
      ? [
          {
            label: payload.human_message,
            to: payload.to,
            data: payload.data || "0x",
            value: payload.value || "0x0",
          },
        ]
      : [];

  async function run() {
    if (state !== "idle" && state !== "error") return;
    const provider = getEthereumProvider();
    if (!provider || !wallet.address) {
      setError("Connect an EVM wallet first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("switching");
      await ensureHederaTestnet(provider);

      const newHashes: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        setStepIndex(i);
        setState("confirming");
        const hash = await sendTransaction(provider, wallet.address, {
          to: steps[i].to,
          data: steps[i].data,
          value: steps[i].value,
        });
        newHashes.push(hash);
        setHashes([...newHashes]);
        setState("broadcasting");
      }
      setState("done");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Transaction was rejected or failed.";
      setError(message);
      setState("error");
    }
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          Hedera EVM Action
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">
          Hedera Testnet (Chain ID 296) — EVM wallet signature required
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm text-[var(--ink)] break-words">{payload.human_message}</p>
          {steps.length > 1 && (
            <p className="text-xs text-[var(--ink-faint)]">
              {steps.length} sequential transactions to execute
            </p>
          )}
        </div>

        {state === "done" ? (
          <div className="flex shrink-0 flex-col items-end gap-1 max-w-full min-w-0">
            {hashes.map((h, i) => {
              const labelText =
                steps.length === 1
                  ? "view on HashScan"
                  : steps[i]?.label
                  ? shortenAddressInText(steps[i].label)
                  : `step ${i + 1}`;
              return (
                <a
                  key={h}
                  href={`https://hashscan.io/testnet/transaction/${h}`}
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
            disabled={state === "switching" || state === "confirming" || state === "broadcasting"}
            className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {state === "idle" && (steps.length > 1 ? "Execute Sequence" : "Send Transaction")}
            {state === "switching" && "switching to Hedera Testnet…"}
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

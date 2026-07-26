"use client";

import { useState } from "react";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { signAndExecute } from "@/lib/hederaWallet";

export type HederaTxBytesPayload = {
  human_message: string;
  error: string | null;
  type: "return_bytes";
  bytes_data: string;
  tx_id?: string | null;
  executed?: boolean;
};

type RunState = "idle" | "confirming" | "done" | "error";

/** Renders a `action/hedera-tx-bytes` artifact from the Hedera wallet action
 * agent (app/agents/specialists/hedera_wallet_action.py) — an unsigned
 * transaction the connected HashPack wallet still needs to sign. Mirrors
 * LiveActionCard.tsx's flow, swapping eth_sendTransaction for HashConnect. */
export function HederaActionCard({
  payload,
  onArtifactUpdate,
}: {
  payload: HederaTxBytesPayload;
  onArtifactUpdate?: (data: string) => void;
}) {
  const wallet = useHederaWallet();
  const isDone = Boolean(payload.executed || payload.tx_id);
  const [state, setState] = useState<RunState>(isDone ? "done" : "idle");
  const [txId, setTxId] = useState<string | null>(payload.tx_id || null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (state !== "idle" && state !== "error") return;
    if (!wallet.connected || !wallet.accountId) {
      setError("Connect a Hedera wallet via WalletConnect first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("confirming");
      const id = await signAndExecute(wallet.accountId, payload.bytes_data);
      setTxId(id);
      setState("done");
      onArtifactUpdate?.(
        JSON.stringify({
          ...payload,
          tx_id: id,
          executed: true,
        })
      );
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Transaction was rejected or failed.";
      setError(message);
      setState("error");
    }
  }

  const hashscanHref = txId
    ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`
    : null;

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          Suggested action
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">
          Hedera · testnet — real transaction, your wallet signature
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <p className="min-w-0 flex-1 max-w-md text-sm text-[var(--ink)] break-words">{payload.human_message}</p>

        {state === "done" ? (
          hashscanHref ? (
            <a
              href={hashscanHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 max-w-full text-center border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
            >
              ✓ view on HashScan
            </a>
          ) : (
            <span className="shrink-0 max-w-full text-center border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)]">
              ✓ executed
            </span>
          )
        ) : !wallet.connected ? (
          <button
            onClick={wallet.connect}
            disabled={wallet.status === "connecting"}
            className="shrink-0 max-w-full text-center border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {wallet.status === "connecting" ? "connecting…" : "connect Hedera (WalletConnect)"}
          </button>
        ) : (
          <button
            onClick={run}
            disabled={state === "confirming"}
            className="shrink-0 max-w-full text-center border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {state === "idle" && "sign & execute"}
            {state === "confirming" && "confirm in wallet…"}
            {state === "error" && "retry"}
          </button>
        )}
      </div>

      {(error || wallet.error) && (
        <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--danger)]">
          {error || wallet.error}
        </p>
      )}
    </div>
  );
}

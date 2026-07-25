"use client";

import { useState } from "react";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { confirmAgent } from "@/lib/api";
import { signAndSendHbarTransfer } from "@/lib/hederaWallet";

export type SeedAgentPayload = {
  status: string;
  name: string;
  account_id: string;
  evm_address?: string;
  public_key?: string;
  vault_registered?: boolean;
  message: string;
  action: {
    type: string;
    id: string;
    label: string;
    description: string;
    protocol: string;
    recipient_account_id: string;
    value: string;
    amount_hbar: number;
    cta: string;
  };
};

type RunState = "idle" | "confirming" | "done" | "error";

export function SeedAgentCard({
  payload,
  ownerAddress,
}: {
  payload: SeedAgentPayload;
  ownerAddress: string;
}) {
  const wallet = useHederaWallet();
  const [state, setState] = useState<RunState>("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function run() {
    if (state !== "idle" && state !== "error") return;
    if (!wallet.connected || !wallet.accountId) {
      setError("Connect a Hedera wallet first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("confirming");
      const id = await signAndSendHbarTransfer(
        wallet.accountId,
        payload.account_id,
        payload.action.amount_hbar
      );
      setTxId(id);

      try {
        await confirmAgent(ownerAddress, payload.name, id);
        setActivated(true);
      } catch (confirmErr) {
        const confirmMsg =
          confirmErr && typeof confirmErr === "object" && "message" in confirmErr
            ? String((confirmErr as { message: unknown }).message)
            : "Agent activation confirmation failed.";
        setError(`Transfer succeeded on-chain, but agent activation failed: ${confirmMsg}`);
      }
      setState("done");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Seed transfer was rejected or failed.";
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
          Agent seed funding
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">
          Hedera · testnet — 1 HBAR seed transfer
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md">
          <p className="text-sm text-[var(--ink)]">
            {payload.action?.description || payload.message}
          </p>
          {activated && (
            <p className="mt-1 text-xs text-[var(--success)]">✓ Agent is now ACTIVE</p>
          )}
        </div>

        {state === "done" && hashscanHref ? (
          <a
            href={hashscanHref}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
          >
            ✓ view on HashScan
          </a>
        ) : !wallet.connected ? (
          <button
            onClick={wallet.connect}
            disabled={wallet.status === "connecting"}
            className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {wallet.status === "connecting" ? "connecting…" : "connect Hedera wallet"}
          </button>
        ) : (
          <button
            onClick={run}
            disabled={state === "confirming"}
            className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {state === "idle" && (payload.action?.cta || "Seed 1 HBAR")}
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

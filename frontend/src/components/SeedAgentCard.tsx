"use client";

import { useState } from "react";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { useWallet } from "@/hooks/useWallet";
import { confirmAgent } from "@/lib/api";
import { signAndSendHbarTransfer } from "@/lib/hederaWallet";
import { ensureHederaTestnet, getEthereumProvider, sendTransaction } from "@/lib/wallet";

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

function getTargetEvmAddress(payload: SeedAgentPayload): string {
  if (payload.evm_address && payload.evm_address.startsWith("0x")) {
    return payload.evm_address;
  }
  const parts = payload.account_id.split(".");
  const num = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(num)) {
    return `0x${num.toString(16).padStart(40, "0")}`;
  }
  return "0x0000000000000000000000000000000000078492";
}

export function SeedAgentCard({
  payload,
  ownerAddress,
}: {
  payload: SeedAgentPayload;
  ownerAddress: string;
}) {
  const hederaWallet = useHederaWallet();
  const evmWallet = useWallet();
  const [state, setState] = useState<RunState>("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function runEvmTransfer() {
    if (state !== "idle" && state !== "error") return;
    const provider = getEthereumProvider();
    if (!provider || !evmWallet.address) {
      if (!evmWallet.connected) {
        await evmWallet.connect();
      }
      const updatedProvider = getEthereumProvider();
      if (!updatedProvider) {
        setError("No EVM wallet detected — install MetaMask or another injected wallet.");
        setState("error");
        return;
      }
    }

    const currentProvider = getEthereumProvider();
    if (!currentProvider) {
      setError("No EVM wallet provider available.");
      setState("error");
      return;
    }

    setError(null);
    try {
      setState("confirming");
      await ensureHederaTestnet(currentProvider);

      const targetEvm = getTargetEvmAddress(payload);
      const amountHbar = payload.action?.amount_hbar || 1.0;
      const valueWei = "0x" + BigInt(Math.round(amountHbar * 1e18)).toString(16);

      const accounts = (await currentProvider.request({ method: "eth_accounts" })) as string[];
      const fromAddr = evmWallet.address || accounts[0];
      if (!fromAddr) {
        throw new Error("No EVM wallet account connected.");
      }

      const hash = await sendTransaction(currentProvider, fromAddr, {
        to: targetEvm,
        data: "0x",
        value: valueWei,
      });
      setTxId(hash);

      try {
        await confirmAgent(ownerAddress, payload.name, hash);
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
          : "Seed transfer via EVM was rejected or failed.";
      setError(message);
      setState("error");
    }
  }

  async function runHederaTransfer() {
    if (state !== "idle" && state !== "error") return;
    if (!hederaWallet.connected || !hederaWallet.accountId) {
      setError("Connect a Hedera wallet via WalletConnect first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("confirming");
      const id = await signAndSendHbarTransfer(
        hederaWallet.accountId,
        payload.account_id,
        payload.action?.amount_hbar || 1.0
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
          Hedera · testnet — {payload.action?.amount_hbar || 1} HBAR seed transfer
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0 flex-1 max-w-md">
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
            className="shrink-0 max-w-full text-center border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
          >
            ✓ view on HashScan
          </a>
        ) : (
          <div className="flex flex-wrap items-center gap-2 max-w-full shrink-0">
            {evmWallet.connected ? (
              <button
                onClick={runEvmTransfer}
                disabled={state === "confirming"}
                className="shrink-0 max-w-full text-center border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
              >
                {state === "confirming"
                  ? "confirm in EVM wallet…"
                  : state === "error"
                  ? "retry (EVM)"
                  : `Seed ${payload.action?.amount_hbar || 1} HBAR (EVM)`}
              </button>
            ) : null}

            {hederaWallet.connected ? (
              <button
                onClick={runHederaTransfer}
                disabled={state === "confirming"}
                className="shrink-0 max-w-full text-center border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-[var(--border)] disabled:cursor-wait disabled:opacity-70"
              >
                {state === "confirming"
                  ? "confirm in Hedera wallet…"
                  : state === "error"
                  ? "retry (Hedera)"
                  : `Seed ${payload.action?.amount_hbar || 1} HBAR (Hedera)`}
              </button>
            ) : null}

            {!evmWallet.connected && !hederaWallet.connected ? (
              <>
                <button
                  onClick={runEvmTransfer}
                  disabled={evmWallet.status === "connecting" || state === "confirming"}
                  className="shrink-0 max-w-full text-center border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
                >
                  {evmWallet.status === "connecting"
                    ? "connecting EVM…"
                    : `Seed ${payload.action?.amount_hbar || 1} HBAR (EVM)`}
                </button>
                <button
                  onClick={hederaWallet.connect}
                  disabled={hederaWallet.status === "connecting" || state === "confirming"}
                  className="shrink-0 max-w-full text-center border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-[var(--border)] disabled:cursor-wait disabled:opacity-70"
                >
                  {hederaWallet.status === "connecting"
                    ? "connecting Hedera…"
                    : "connect Hedera (WalletConnect)"}
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {(error || hederaWallet.error || evmWallet.error) && (
        <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--danger)]">
          {error || hederaWallet.error || evmWallet.error}
        </p>
      )}
    </div>
  );
}


"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { getEthereumProvider, sendTransaction, shortenAddressInText, type EthereumProvider } from "@/lib/wallet";

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/** Switches the connected wallet to Sepolia, adding it first if the wallet doesn't know it yet. */
async function ensureSepolia(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_CHAIN_ID_HEX,
          chainName: "Sepolia",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}



type ActionStep = { label: string; to: string; data: string; value: string };

export type YieldActionPayload = {
  protocol: string;
  network: string;
  chain_id: number;
  asset_symbol: string;
  amount: number;
  apy_pct: number;
  rationale: string;
  steps: ActionStep[];
};

type RunState = "idle" | "switching" | "confirming" | "broadcasting" | "done" | "error";

export function LiveActionCard({ action }: { action: YieldActionPayload }) {
  const wallet = useWallet();
  const [state, setState] = useState<RunState>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [hashes, setHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (state !== "idle" && state !== "error") return;
    const provider = getEthereumProvider();
    if (!provider || !wallet.address) {
      setError("Connect a wallet first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("switching");
      await ensureSepolia(provider);

      const newHashes: string[] = [];
      for (let i = 0; i < action.steps.length; i++) {
        setStepIndex(i);
        setState("confirming");
        const hash = await sendTransaction(provider, wallet.address, action.steps[i]);
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
          Suggested action
        </p>
        <p className="text-[10px] text-[var(--ink-faint)]">
          {action.protocol} · {action.network} — real transaction, real wallet signature
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--ink)]">
              Supply {action.amount} {action.asset_symbol}
            </span>
            <span className="text-xs tabular-nums text-[var(--success)]">
              {action.apy_pct.toFixed(2)}% APY
            </span>
          </div>
          <p className="max-w-md text-xs text-[var(--ink-faint)] break-words">{action.rationale}</p>
        </div>

        {state === "done" ? (
          <div className="flex shrink-0 flex-col items-end gap-1 max-w-full min-w-0">
            {hashes.map((h, i) => (
              <a
                key={h}
                href={`https://sepolia.etherscan.io/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
              >
                ✓ {shortenAddressInText(action.steps[i]?.label ?? `step ${i + 1}`)} · {h.slice(0, 10)}…
              </a>
            ))}
          </div>
        ) : (
          <button
            onClick={run}
            disabled={state === "switching" || state === "confirming" || state === "broadcasting"}
            className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85 disabled:cursor-wait disabled:opacity-70"
          >
            {state === "idle" && `Approve & Supply ${action.asset_symbol}`}
            {state === "switching" && "switching to Sepolia…"}
            {state === "confirming" &&
              `confirm in wallet — ${action.steps[stepIndex]?.label ?? "step"}…`}
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

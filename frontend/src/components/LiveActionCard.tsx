"use client";

import { ActionCard, type ChainStrategy } from "./action-cards/ActionCard";
import { ensureSepolia, shortenAddressInText } from "@/lib/wallet";

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
  hashes?: string[];
  executed?: boolean;
};

export function LiveActionCard({
  action,
  onArtifactUpdate,
}: {
  action: YieldActionPayload;
  onArtifactUpdate?: (data: string) => void;
}) {
  const strategy: ChainStrategy = {
    ensureChain: ensureSepolia,
    explorerTxUrl: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
    explorerLabel: (_, index) =>
      shortenAddressInText(action.steps[index]?.label ?? `step ${index + 1}`),
  };

  return (
    <ActionCard
      strategy={strategy}
      eyebrow="Suggested action"
      subtitle={`${action.protocol} · ${action.network} — real transaction, real wallet signature`}
      idleLabel={`Approve & Supply ${action.asset_symbol}`}
      steps={action.steps}
      switchingLabel="switching to Sepolia…"
      initialHashes={action.hashes}
      initialDone={Boolean(action.executed || (action.hashes && action.hashes.length > 0))}
      onComplete={(hashes) => {
        onArtifactUpdate?.(
          JSON.stringify({
            ...action,
            hashes,
            executed: true,
          })
        );
      }}
    >
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
    </ActionCard>
  );
}

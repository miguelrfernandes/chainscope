"use client";

import { ActionCard, type ChainStrategy } from "./action-cards/ActionCard";
import { ensureHederaTestnet, shortenAddressInText } from "@/lib/wallet";

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
  hashes?: string[];
  executed?: boolean;
};

export function HederaEvmActionCard({
  payload,
  onArtifactUpdate,
}: {
  payload: HederaEvmActionPayload;
  onArtifactUpdate?: (data: string) => void;
}) {
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

  const strategy: ChainStrategy = {
    ensureChain: ensureHederaTestnet,
    explorerTxUrl: (hash) => `https://hashscan.io/testnet/transaction/${hash}`,
    explorerLabel: (label, index) =>
      steps.length === 1
        ? "view on HashScan"
        : label
        ? shortenAddressInText(label)
        : `step ${index + 1}`,
  };

  return (
    <ActionCard
      strategy={strategy}
      eyebrow="Hedera EVM Action"
      subtitle="Hedera Testnet (Chain ID 296) — EVM wallet signature required"
      humanMessage={payload.human_message}
      steps={steps}
      switchingLabel="switching to Hedera Testnet…"
      initialHashes={payload.hashes}
      initialDone={Boolean(payload.executed || (payload.hashes && payload.hashes.length > 0))}
      onComplete={(hashes) => {
        onArtifactUpdate?.(
          JSON.stringify({
            ...payload,
            hashes,
            executed: true,
          })
        );
      }}
    />
  );
}

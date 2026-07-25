"use client";

import { ActionCard, type ChainStrategy } from "./action-cards/ActionCard";
import { chainName, ensureChain, explorerTxUrl } from "@/lib/wallet";

export type EvmStep = {
  label?: string;
  to: string;
  data: string;
  value: string;
};

export type EvmActionPayload = {
  protocol?: string;
  network?: string;
  chain_id?: number;
  human_message: string;
  to?: string;
  value?: string;
  data?: string;
  steps?: EvmStep[];
};

export function EvmActionCard({ payload }: { payload: EvmActionPayload }) {
  const chainId = payload.chain_id || 1;
  const networkTitle = payload.network || chainName(chainId);
  const protocolTitle = payload.protocol || "EVM Action";

  const steps: EvmStep[] =
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
    ensureChain: (provider) => ensureChain(provider, chainId),
    explorerTxUrl: (hash) => explorerTxUrl(chainId, hash),
  };

  return (
    <ActionCard
      strategy={strategy}
      eyebrow={protocolTitle}
      subtitle={`${networkTitle} (Chain ID ${chainId}) — EVM wallet signature required`}
      humanMessage={payload.human_message}
      steps={steps}
      switchingLabel={`switching to ${networkTitle}…`}
    />
  );
}

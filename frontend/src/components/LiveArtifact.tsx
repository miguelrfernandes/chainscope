import type { BackendArtifact } from "@/lib/api";
import { LiveActionCard, type YieldActionPayload } from "./LiveActionCard";
import { HederaActionCard, type HederaTxBytesPayload } from "./HederaActionCard";
import { SeedAgentCard, type SeedAgentPayload } from "./SeedAgentCard";
import { HederaEvmActionCard, type HederaEvmActionPayload } from "./HederaEvmActionCard";
import { EvmActionCard, type EvmActionPayload } from "./EvmActionCard";
import { PlotlyArtifact } from "./charts/PlotlyArtifact";


type HederaExecutedPayload = {
  human_message: string;
  error: string | null;
  type: "executed_transaction";
  raw: { status: string; transaction_id: string | null; [key: string]: unknown };
};

export function LiveArtifact({
  artifact,
  ownerAddress = "0xdefault_owner",
}: {
  artifact: BackendArtifact;
  ownerAddress?: string;
}) {
  if (artifact.type === "action/yield-supply") {
    let payload: YieldActionPayload | { error: string };
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    if ("error" in payload) return null;
    return <LiveActionCard action={payload} />;
  }

  if (artifact.type === "action/seed-agent-hbar") {
    let payload: SeedAgentPayload;
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    if (!payload.action || payload.action.type !== "action/seed-agent-hbar") return null;
    return <SeedAgentCard payload={payload} ownerAddress={ownerAddress} />;
  }

  if (artifact.type === "action/hedera-tx-bytes") {

    let payload: HederaTxBytesPayload;
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    if (payload.error || !payload.bytes_data) return null;
    return <HederaActionCard payload={payload} />;
  }

  if (artifact.type === "action/evm-tx-batch") {
    let payload: EvmActionPayload;
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    return <EvmActionCard payload={payload} />;
  }

  if (artifact.type === "action/hedera-evm-tx" || artifact.type === "action/hedera-evm-tx-batch") {
    let payload: HederaEvmActionPayload;
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    return <HederaEvmActionCard payload={payload} />;
  }

  if (artifact.type === "action/hedera-tx") {
    let payload: HederaExecutedPayload;
    try {
      payload = JSON.parse(artifact.data);
    } catch {
      return null;
    }
    if (payload.error) return null;
    const txId = payload.raw?.transaction_id;
    const hashscanHref = txId
      ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`
      : null;
    return (
      <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50">
        <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
            Executed
          </p>
          <p className="text-[10px] text-[var(--ink-faint)]">
            Hedera · testnet — backend demo account, already broadcast
          </p>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm text-[var(--ink)]">{payload.human_message}</p>
          {hashscanHref && (
            <a
              href={hashscanHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] transition hover:border-[var(--success)]"
            >
              ✓ view on HashScan
            </a>
          )}
        </div>
      </div>
    );
  }

  if (artifact.type === "image/png") {
    return (
      <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-raised)]/50 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${artifact.data}`}
          alt="Agent-generated chart"
          className="max-w-full"
        />
      </div>
    );
  }

  if (artifact.type === "application/vnd.plotly.v1+json") {
    return <PlotlyArtifact data={artifact.data} />;
  }


  return null;
}

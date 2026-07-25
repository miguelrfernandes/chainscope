import type { BackendArtifact } from "@/lib/api";
import { LiveActionCard, type YieldActionPayload } from "./LiveActionCard";

export function LiveArtifact({ artifact }: { artifact: BackendArtifact }) {
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
    return (
      <details className="border border-[var(--border)] bg-[var(--bg-raised)]/50 px-4 py-2.5 text-[13px] text-[var(--ink-dim)]">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          interactive chart (plotly) — raw figure data
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--ink-faint)]">
          {artifact.data}
        </pre>
      </details>
    );
  }

  return null;
}

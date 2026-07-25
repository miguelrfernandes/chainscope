"use client";

import type { AgentStep, Source } from "@/lib/scenarios";
import type { BackendArtifact } from "@/lib/api";
import { StreamingAnswer } from "./StreamingAnswer";
import { SourcesRow } from "./SourcesRow";
import { LiveArtifact } from "./LiveArtifact";

export type LiveState = {
  steps: AgentStep[];
  answer: string | null;
  sources: Source[];
  artifacts: BackendArtifact[];
  error: string | null;
};

export function LiveAssistantTurn({
  live,
  instant = false,
}: {
  live: LiveState;
  instant?: boolean;
}) {
  if (live.error) {
    return (
      <p className="text-[13px] text-[var(--danger)]">
        {live.error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {live.steps.length > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] py-1 pl-3.5 text-[13px]">
          {live.steps.map((step, i) => {
            const isLast = !live.answer && i === live.steps.length - 1;
            return (
              <div key={i} className="flex items-baseline gap-2 text-[var(--ink-dim)]">
                {isLast ? (
                  <span className="relative shrink-0 text-[var(--accent)]">
                    <span className="animate-caret">▮</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[var(--success)]">✓</span>
                )}
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
                  {step.agent}
                </span>
                <span className={live.answer ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}>
                  {step.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!live.answer && live.steps.length === 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] py-1 pl-3.5 text-[13px]">
          <div className="flex items-baseline gap-2 text-[var(--ink-dim)]">
            <span className="relative shrink-0 text-[var(--accent)]">
              <span className="animate-caret">▮</span>
            </span>
            <span className="text-[var(--ink)]">Contacting ChainScope agents...</span>
          </div>
        </div>
      )}

      {live.answer && (
        <div className="flex flex-col gap-3">
          <StreamingAnswer text={live.answer} instant={instant} />
          {live.artifacts.length > 0 && (
            <div className="flex flex-col gap-3">
              {live.artifacts.map((a, i) => (
                <LiveArtifact key={i} artifact={a} />
              ))}
            </div>
          )}
          {live.sources.length > 0 && <SourcesRow sources={live.sources} />}
        </div>
      )}
    </div>
  );
}

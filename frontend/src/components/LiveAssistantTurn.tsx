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

  // Group steps by agent label for nested sub-item display
  const groupedSteps: { agent: string; mainText: string; subItems: string[] }[] = [];
  for (const step of live.steps) {
    if (step.agent === "Orchestrator") {
      groupedSteps.push({ agent: step.agent, mainText: step.text, subItems: [] });
    } else {
      const existing = groupedSteps.find((g) => g.agent === step.agent);
      if (existing) {
        existing.subItems.push(step.text);
      } else {
        groupedSteps.push({ agent: step.agent, mainText: `Executing ${step.agent}...`, subItems: [step.text] });
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {groupedSteps.length > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] py-1 pl-3.5 text-[13px]">
          {groupedSteps.map((group, i) => {
            const isLastGroup = !live.answer && i === groupedSteps.length - 1;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-[var(--ink-dim)]">
                  {isLastGroup && group.subItems.length === 0 ? (
                    <span className="relative shrink-0 text-[var(--accent)]">
                      <span className="animate-caret">▮</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[var(--success)]">✓</span>
                  )}
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
                    {group.agent}
                  </span>
                  <span className={live.answer ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}>
                    {group.mainText}
                  </span>
                </div>
                {group.subItems.length > 0 && (
                  <div className="ml-5 flex flex-col gap-1 border-l border-[var(--border)] pl-2.5 text-xs text-[var(--ink-dim)]">
                    {group.subItems.map((sub, j) => {
                      const isLastSub = isLastGroup && j === group.subItems.length - 1;
                      return (
                        <div key={j} className="flex items-center gap-1.5">
                          {isLastSub ? (
                            <span className="relative shrink-0 text-[var(--accent)] text-[10px]">
                              <span className="animate-caret">▮</span>
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-[var(--ink-faint)]">•</span>
                          )}
                          <span className={live.answer ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}>
                            {sub}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
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

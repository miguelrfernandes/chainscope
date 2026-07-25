"use client";

import { useEffect, useState } from "react";
import type { AgentStep } from "@/lib/scenarios";

const STEP_DELAY_MS = 750;

export function AgentStatusList({
  steps,
  onDone,
}: {
  steps: AgentStep[];
  onDone: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(1);
  const [activeDone, setActiveDone] = useState(false);

  useEffect(() => {
    if (visibleCount > steps.length) return;

    const activeTimer = setTimeout(() => {
      setActiveDone(true);
    }, STEP_DELAY_MS * 0.7);

    const nextTimer = setTimeout(() => {
      if (visibleCount === steps.length) {
        onDone();
      } else {
        setActiveDone(false);
        setVisibleCount((c) => c + 1);
      }
    }, STEP_DELAY_MS);

    return () => {
      clearTimeout(activeTimer);
      clearTimeout(nextTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, steps.length]);

  const shown = steps.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-2 border-l-2 border-[var(--border)] py-1 pl-3.5 text-[13px]">
      {shown.map((step, i) => {
        const isLast = i === shown.length - 1;
        const isDone = !isLast || activeDone;
        return (
          <div key={i} className="flex items-baseline gap-2 text-[var(--ink-dim)]">
            {isDone ? (
              <span className="shrink-0 text-[var(--success)]">✓</span>
            ) : (
              <span className="relative shrink-0 text-[var(--accent)]">
                <span className="animate-caret">▮</span>
              </span>
            )}
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
              {step.agent}
            </span>
            <span className={isDone ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}>
              {step.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm">
      {shown.map((step, i) => {
        const isLast = i === shown.length - 1;
        const isDone = !isLast || activeDone;
        return (
          <div key={i} className="flex items-center gap-2 text-white/70">
            {isDone ? (
              <span className="text-emerald-400 shrink-0">✓</span>
            ) : (
              <span className="shrink-0 h-3 w-3 rounded-full border-2 border-white/25 border-t-violet-400 animate-spin" />
            )}
            <span className="text-violet-300 font-medium shrink-0">
              {step.agent}
            </span>
            <span className="text-white/50">·</span>
            <span className={isDone ? "text-white/60" : "text-white/85"}>
              {step.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

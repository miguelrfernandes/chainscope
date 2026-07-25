"use client";

import { useEffect, useState } from "react";
import type { Scenario } from "@/lib/scenarios";
import { ProvenanceTag } from "./ProvenanceTag";

export function BarChartArtifact({ bar }: { bar: NonNullable<Scenario["bar"]> }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, []);

  const max = Math.max(...bar.data.map((d) => d.value));

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          {bar.title}
        </p>
        <ProvenanceTag icon="⌁">python · pandas</ProvenanceTag>
      </div>
      <div className="flex items-end gap-4 h-40">
        {bar.data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs text-[var(--ink-dim)] tabular-nums">
              {bar.unit}
              {d.value.toLocaleString()}
            </span>
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full transition-all duration-700 ease-out"
                style={{
                  height: grown ? `${(d.value / max) * 100}%` : "0%",
                  backgroundColor: d.color,
                }}
              />
            </div>
            <span className="text-xs text-[var(--ink-dim)]">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Scenario } from "@/lib/scenarios";

export function BarChartArtifact({ bar }: { bar: NonNullable<Scenario["bar"]> }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, []);

  const max = Math.max(...bar.data.map((d) => d.value));

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">
          {bar.title}
        </p>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
          generated in python sandbox
        </span>
      </div>
      <div className="flex items-end gap-4 h-40">
        {bar.data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs text-white/60 tabular-nums">
              {bar.unit}
              {d.value.toLocaleString()}
            </span>
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full rounded-t-md transition-all duration-700 ease-out"
                style={{
                  height: grown ? `${(d.value / max) * 100}%` : "0%",
                  backgroundColor: d.color,
                }}
              />
            </div>
            <span className="text-xs text-white/70">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

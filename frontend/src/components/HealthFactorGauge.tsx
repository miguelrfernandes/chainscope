"use client";

import { useEffect, useState } from "react";
import { ProvenanceTag } from "./ProvenanceTag";

// Scale 0 -> 2.0, zones: red < 1.0, amber 1.0-1.5, green > 1.5
const SCALE_MAX = 2;

function zoneColor(value: number) {
  if (value < 1) return "var(--danger)";
  if (value < 1.5) return "var(--accent)";
  return "var(--success)";
}

export function HealthFactorGauge({ value }: { value: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, []);

  const pct = Math.min(value / SCALE_MAX, 1) * 100;
  const color = zoneColor(value);

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          Health factor
        </p>
        <ProvenanceTag icon="●">live · Aave v3 position</ProvenanceTag>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-medium tabular-nums" style={{ color }}>
          {value.toFixed(2)}
        </span>
        <span className="text-xs text-[var(--ink-faint)]">liquidation at 1.00</span>
      </div>
      <div className="relative mt-3 h-2 w-full bg-[var(--border)]">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[var(--danger)]/30" />
        <div className="absolute inset-y-0 left-1/2 w-1/4 bg-[var(--accent)]/30" />
        <div className="absolute inset-y-0 left-3/4 w-1/4 bg-[var(--success)]/30" />
        <div
          className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 transition-all duration-700 ease-out"
          style={{ left: grown ? `calc(${pct}% - 1.5px)` : "0%", background: color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-faint)]">
        <span>0.0</span>
        <span>1.0</span>
        <span>1.5</span>
        <span>2.0+</span>
      </div>
    </div>
  );
}

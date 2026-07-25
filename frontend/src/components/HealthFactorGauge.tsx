"use client";

import { useEffect, useState } from "react";

// Scale 0 -> 2.0, zones: red < 1.0, amber 1.0-1.5, green > 1.5
const SCALE_MAX = 2;

function zoneColor(value: number) {
  if (value < 1) return "#f87171";
  if (value < 1.5) return "#fbbf24";
  return "#34d399";
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">
          Health factor
        </p>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
          live from Aave v3 position
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
          {value.toFixed(2)}
        </span>
        <span className="text-xs text-white/40">liquidation at 1.00</span>
      </div>
      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-red-400/40" />
        <div className="absolute inset-y-0 left-1/2 w-1/4 bg-amber-400/40" />
        <div className="absolute inset-y-0 left-3/4 w-1/4 bg-emerald-400/40" />
        <div
          className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-700 ease-out"
          style={{ left: grown ? `calc(${pct}% - 3px)` : "0%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/35">
        <span>0.0</span>
        <span>1.0</span>
        <span>1.5</span>
        <span>2.0+</span>
      </div>
    </div>
  );
}

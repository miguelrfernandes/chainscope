"use client";

import { useEffect, useState } from "react";
import type { Scenario } from "@/lib/scenarios";
import { ProvenanceTag } from "./ProvenanceTag";

const WIDTH = 480;
const HEIGHT = 140;
const PAD = 16;

export function LineChartArtifact({ line }: { line: NonNullable<Scenario["line"]> }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 30);
    return () => clearTimeout(t);
  }, []);

  const values = line.data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = line.data.map((d, i) => {
    const x = PAD + (i / (line.data.length - 1)) * (WIDTH - PAD * 2);
    const y =
      HEIGHT - PAD - ((d.value - min) / span) * (HEIGHT - PAD * 2);
    return { x, y, ...d };
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${HEIGHT - PAD} L ${points[0].x.toFixed(1)} ${HEIGHT - PAD} Z`;

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-raised)]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
          {line.title}
        </p>
        <ProvenanceTag icon="⌁">python · pandas</ProvenanceTag>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb454" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffb454" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill="url(#lineFill)"
          className="transition-opacity duration-700"
          style={{ opacity: drawn ? 1 : 0 }}
        />
        <path
          d={path}
          fill="none"
          stroke="#ffb454"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={drawn ? 0 : 1}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="#ffb454"
            className="transition-opacity duration-700"
            style={{ opacity: drawn ? 1 : 0, transitionDelay: `${i * 60}ms` }}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-faint)]">
        {line.data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

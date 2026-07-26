"use client";

import { useState } from "react";
import type { Source } from "@/lib/scenarios";

const COLLAPSE_THRESHOLD = 3;

function SourcePill({ s, i }: { s: Source; i: number }) {
  const isSubgraph = s.kind === "subgraph";
  return (
    <span
      key={`${s.id}-${i}`}
      tabIndex={0}
      className="group relative inline-flex items-baseline gap-1.5 rounded-full border border-white/5 bg-white/5 px-2.5 py-1 transition-all duration-300 hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] outline-none cursor-pointer"
    >
      <span className="text-[var(--ink-dim)] font-medium">{s.label}</span>
      <span className="text-[var(--ink-faint)]">·</span>
      {isSubgraph ? (
        <a
          href={`https://thegraph.com/explorer?search=${encodeURIComponent(s.id)}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[var(--accent)]/90 underline decoration-[var(--accent)]/30 underline-offset-2 hover:text-[var(--accent)] font-medium"
        >
          {s.id}
        </a>
      ) : (
        <span className="font-mono text-[var(--ink-dim)] font-medium">{s.id}</span>
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-sm rounded-xl border border-white/10 bg-[#070a09]/95 backdrop-blur-xl p-3 text-[10px] normal-case leading-relaxed text-[var(--ink)] shadow-2xl transition-all duration-300 group-hover:block group-focus:block animate-fade-in"
      >
        <span className="mb-1 block font-mono text-[9px] text-[var(--ink-faint)] uppercase tracking-wider font-semibold">
          query
        </span>
        <code className="break-words font-mono text-[var(--accent)]">
          {s.query}
        </code>
      </span>
    </span>
  );
}

export function SourcesRow({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = sources.length > COLLAPSE_THRESHOLD;
  const visible = shouldCollapse && !expanded ? sources.slice(0, COLLAPSE_THRESHOLD) : sources;
  const hiddenCount = sources.length - COLLAPSE_THRESHOLD;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-soft)] pt-3 text-[11px]">
      <span className="font-mono uppercase tracking-wider text-[var(--ink-faint)] font-medium">
        sources
      </span>
      {visible.map((s, i) => (
        <SourcePill key={`${s.id}-${i}`} s={s} i={i} />
      ))}
      {shouldCollapse && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-white/5 px-2.5 py-1 font-mono text-[var(--ink-faint)] transition-all duration-200 hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] cursor-pointer"
        >
          +{hiddenCount} more
        </button>
      )}
      {shouldCollapse && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-white/5 px-2.5 py-1 font-mono text-[var(--ink-faint)] transition-all duration-200 hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] cursor-pointer"
        >
          show less
        </button>
      )}
    </div>
  );
}

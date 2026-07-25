import type { Source } from "@/lib/scenarios";

export function SourcesRow({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-soft)] pt-3 text-[11px]">
      <span className="uppercase tracking-wider text-[var(--ink-faint)]">
        sources
      </span>
      {sources.map((s) => (
        <span key={s.id} className="inline-flex items-baseline gap-1.5">
          <span className="text-[var(--ink-dim)]">{s.label}</span>
          <span className="text-[var(--ink-faint)]">·</span>
          <a
            href={`https://thegraph.com/explorer?search=${encodeURIComponent(s.id)}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)]/80 underline decoration-[var(--accent)]/30 underline-offset-2 hover:text-[var(--accent)]"
          >
            {s.id}
          </a>
        </span>
      ))}
    </div>
  );
}

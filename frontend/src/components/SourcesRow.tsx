import type { Source } from "@/lib/scenarios";

export function SourcesRow({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-soft)] pt-3 text-[11px]">
      <span className="uppercase tracking-wider text-[var(--ink-faint)]">
        sources
      </span>
      {sources.map((s) => (
        <span
          key={s.id}
          tabIndex={0}
          className="group relative inline-flex items-baseline gap-1.5 outline-none"
        >
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
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden w-max max-w-xs rounded border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-2 text-[10px] normal-case leading-relaxed text-[var(--ink)] shadow-lg group-hover:block group-focus:block"
          >
            <span className="mb-1 block text-[var(--ink-faint)] uppercase tracking-wider">
              query
            </span>
            <code className="break-words font-mono text-[var(--accent)]">
              {s.query}
            </code>
          </span>
        </span>
      ))}
    </div>
  );
}

import { HISTORY } from "@/lib/scenarios";

export function HistorySidebar({
  activeId,
  onSelect,
  onNewChat,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] py-4 sm:flex">
      <div className="px-4 pb-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
        >
          <span className="text-[var(--accent)]">+</span>
          new conversation
        </button>
      </div>

      <p className="px-4 pb-2 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        history
      </p>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {HISTORY.map(({ scenario, agoLabel }) => {
          const active = activeId === scenario.id;
          return (
            <button
              key={scenario.id}
              onClick={() => onSelect(scenario.id)}
              className={`flex flex-col items-start gap-0.5 border-l-2 px-2.5 py-2 text-left transition ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-raised)]/60"
              }`}
            >
              <span
                className={`line-clamp-2 text-[12.5px] leading-snug ${
                  active ? "text-[var(--ink)]" : "text-[var(--ink-dim)]"
                }`}
              >
                {scenario.question}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-faint)]">
                <span className="uppercase tracking-wide text-[var(--accent)]/70">
                  {scenario.agent.replace(" agent", "")}
                </span>
                ·{agoLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

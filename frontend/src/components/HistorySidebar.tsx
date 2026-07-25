import Link from "next/link";
import { HISTORY } from "@/lib/scenarios";
import { formatRelativeTime, type StoredThread } from "@/lib/history";

export function HistorySidebar({
  activeId,
  onSelectExample,
  onSelectThread,
  onNewChat,
  threads,
  walletConnected,
}: {
  activeId: string | null;
  onSelectExample: (id: string) => void;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  threads: StoredThread[];
  walletConnected: boolean;
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

      <div className="flex flex-1 flex-col overflow-y-auto px-2">
        <p className="px-2 pb-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          your history
        </p>
        {!walletConnected ? (
          <p className="px-2.5 pb-4 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
            Real, live questions — connect a wallet to save them and revisit later.
          </p>
        ) : threads.length === 0 ? (
          <p className="px-2.5 pb-4 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
            Real questions you ask the live agents will show up here.
          </p>
        ) : (
          <nav className="flex flex-col gap-0.5 pb-4">
            {threads.map((t) => {
              const active = activeId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectThread(t.id)}
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
                    {t.title}
                  </span>
                  <span className="text-[10px] text-[var(--ink-faint)]">
                    {formatRelativeTime(t.updatedAt)}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        <p className="px-2 pb-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          demo scenarios
        </p>
        <p className="px-2.5 pb-2 text-[10.5px] leading-relaxed text-[var(--ink-faint)]">
          Mock walkthroughs with scripted answers — not live data, no wallet needed.
        </p>
        <nav className="flex flex-col gap-0.5 pb-2">
          {HISTORY.map(({ scenario, agoLabel }) => {
            const active = activeId === scenario.id;
            return (
              <button
                key={scenario.id}
                onClick={() => onSelectExample(scenario.id)}
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
                  <span className="border border-[var(--ink-faint)]/40 px-1 uppercase tracking-wide text-[var(--ink-faint)]">
                    mock
                  </span>
                  <span className="uppercase tracking-wide text-[var(--accent)]/70">
                    {scenario.agent.replace(" agent", "")}
                  </span>
                  ·{agoLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-4 pt-3">
        <Link
          href="/"
          className="text-[11px] text-[var(--ink-faint)] transition hover:text-[var(--accent)]"
        >
          ← back to chainscope.ai
        </Link>
      </div>
    </aside>
  );
}

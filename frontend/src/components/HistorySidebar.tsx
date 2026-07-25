import Link from "next/link";
import { HISTORY } from "@/lib/scenarios";
import { formatRelativeTime, type StoredThread } from "@/lib/history";

export function HistorySidebar({
  activeId,
  onSelectExample,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  threads,
  walletConnected,
}: {
  activeId: string | null;
  onSelectExample: (id: string) => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
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
                <div
                  key={t.id}
                  className={`group relative flex items-center border-l-2 transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-raised)]/60"
                  }`}
                >
                  <button
                    onClick={() => onSelectThread(t.id)}
                    className="flex flex-1 flex-col items-start gap-0.5 py-2 pl-2.5 pr-7 text-left"
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread(t.id);
                    }}
                    title="Delete conversation"
                    className="absolute right-1.5 p-1 text-[var(--ink-faint)] opacity-0 transition hover:text-[var(--danger)] group-hover:opacity-100"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
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

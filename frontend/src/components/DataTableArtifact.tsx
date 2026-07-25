import type { Scenario } from "@/lib/scenarios";

export function DataTableArtifact({ table }: { table: NonNullable<Scenario["table"]> }) {
  return (
    <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-raised)]/50">
      <p className="border-b border-[var(--border)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
        {table.title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[var(--ink-faint)]">
              {table.columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium uppercase tracking-wide">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--border-soft)] text-[var(--ink)]">
                {table.columns.map((c) => (
                  <td key={c} className="px-4 py-2 tabular-nums">
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

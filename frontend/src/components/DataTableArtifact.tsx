import type { Scenario } from "@/lib/scenarios";

export function DataTableArtifact({ table }: { table: NonNullable<Scenario["table"]> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <p className="border-b border-white/10 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-white/50">
        {table.title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-white/45">
              {table.columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-white/5 text-white/80">
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

export function ProvenanceTag({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
      <span className="text-[var(--accent)]">{icon}</span>
      {children}
    </span>
  );
}

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <line x1="12" y1="11" x2="12" y2="4.4" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.85" />
      <line x1="12" y1="11" x2="5.6" y2="17.2" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.85" />
      <line x1="12" y1="11" x2="18.4" y2="17.2" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.85" />
      <circle cx="12" cy="11" r="2.6" fill="currentColor" />
      <circle cx="12" cy="4.4" r="1.6" fill="currentColor" fillOpacity="0.55" />
      <circle cx="5.6" cy="17.2" r="1.6" fill="currentColor" fillOpacity="0.55" />
      <circle cx="18.4" cy="17.2" r="1.6" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}

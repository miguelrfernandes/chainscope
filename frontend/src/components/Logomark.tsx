export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="14.5" cy="9.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.55" />
      <circle cx="9.5" cy="14.5" r="5" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.95" />
      <circle cx="9.5" cy="14.5" r="2.6" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.7" />
      <line x1="9.5" y1="8.3" x2="9.5" y2="10.6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
      <line x1="9.5" y1="18.4" x2="9.5" y2="20.7" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
      <line x1="3.3" y1="14.5" x2="5.6" y2="14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
      <line x1="13.4" y1="14.5" x2="15.7" y2="14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
      <circle cx="9.5" cy="14.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

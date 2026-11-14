/** Logo mark: a small gift tag on a string. */
export function GiftTagMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <path d="M4 6c3 0 5 2 7 5" fill="none" stroke="var(--ribbon)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M12.5 8.5 25 9.8a2 2 0 0 1 1.8 2l-.6 13.4a2 2 0 0 1-2.2 1.9l-12.5-1.3a2 2 0 0 1-1.8-2.1l.6-9.8a2 2 0 0 1 .6-1.3l1.7-1.6a2 2 0 0 1 1.5-.5Z"
        fill="var(--mint)"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="13.6" cy="12.9" r="1.3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4" />
      <path d="M16 19.5h6.5M16.4 22.6h4" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

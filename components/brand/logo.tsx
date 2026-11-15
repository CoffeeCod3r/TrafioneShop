import { cn } from "@/lib/utils";

/**
 * Logo mark: a gift tag hanging on a ribbon, with a small heart punched in.
 * Colors come from the palette tokens so it adapts to the theme.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      {/* ribbon loop */}
      <path
        d="M6 5c5-2 9 1 10 6"
        fill="none"
        stroke="var(--ribbon)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* tag body */}
      <path
        d="M15.5 9.5 33 11.6a2.6 2.6 0 0 1 2.3 2.8l-1.4 18.2a2.6 2.6 0 0 1-2.9 2.4L13.9 33a2.6 2.6 0 0 1-2.3-2.8l1-13.3a2.6 2.6 0 0 1 .8-1.7l2.2-2.3"
        fill="var(--mint)"
        stroke="var(--ink)"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* punched hole */}
      <circle cx="16.6" cy="14.6" r="1.9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      {/* heart */}
      <path
        d="M24 27.6s-5.2-3-5-6.4c.1-1.6 1.4-2.6 2.8-2.4 1 .1 1.8.8 2.2 1.6.5-.8 1.4-1.4 2.4-1.4 1.4 0 2.6 1.2 2.4 2.8-.3 3.3-4.8 5.8-4.8 5.8Z"
        fill="var(--ribbon)"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full logo: mark + "Prezentownik" + "AI" badge. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="logo-mark size-9" />
      <span className="font-display text-xl font-extrabold tracking-tight">Prezentownik</span>
      <span className="rounded-md border-2 border-ink bg-ribbon px-1.5 py-px font-display text-xs font-extrabold leading-tight text-white">
        AI
      </span>
    </span>
  );
}

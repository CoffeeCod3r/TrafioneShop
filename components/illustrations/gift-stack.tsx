/**
 * Original illustration: three wrapped gifts with ribbons, a gift tag and sparkles.
 * Decorative (aria-hidden); colors come from the palette tokens.
 */
export function GiftStack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden focusable="false">
      {/* ground shadow */}
      <ellipse cx="160" cy="222" rx="128" ry="10" fill="var(--ink)" opacity="0.08" />

      {/* big box: lilac with raspberry ribbon */}
      <g transform="rotate(-4 120 160)">
        <rect x="52" y="110" width="140" height="104" rx="10" fill="var(--lilac)" stroke="var(--ink)" strokeWidth="4" />
        <rect x="44" y="92" width="156" height="30" rx="8" fill="var(--lilac)" stroke="var(--ink)" strokeWidth="4" />
        <rect x="112" y="92" width="20" height="122" fill="var(--ribbon)" stroke="var(--ink)" strokeWidth="4" />
        <path
          d="M122 92c-14-26-46-30-46-12 0 12 26 14 46 12Zm0 0c14-26 46-30 46-12 0 12-26 14-46 12Z"
          fill="var(--ribbon)"
          stroke="var(--ink)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* polka dots on wrapping paper */}
        <g fill="var(--paper)" opacity="0.9">
          <circle cx="76" cy="146" r="5" />
          <circle cx="160" cy="140" r="5" />
          <circle cx="90" cy="186" r="5" />
          <circle cx="170" cy="190" r="5" />
        </g>
      </g>

      {/* small box: mint with sun ribbon */}
      <g transform="rotate(6 236 186)">
        <rect x="196" y="150" width="84" height="64" rx="8" fill="var(--mint)" stroke="var(--ink)" strokeWidth="4" />
        <rect x="190" y="138" width="96" height="20" rx="6" fill="var(--mint)" stroke="var(--ink)" strokeWidth="4" />
        <rect x="230" y="138" width="14" height="76" fill="var(--sun)" stroke="var(--ink)" strokeWidth="4" />
        <path
          d="M237 138c-8-16-28-18-28-7 0 7 16 9 28 7Zm0 0c8-16 28-18 28-7 0 7-16 9-28 7Z"
          fill="var(--sun)"
          stroke="var(--ink)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>

      {/* gift tag on a string */}
      <path d="M186 104c18 4 30 16 36 32" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <g transform="rotate(14 232 150)">
        <path
          d="M214 132h44a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6h-44l-12-12v-14Z"
          fill="#ffffff"
          stroke="var(--ink)"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <circle cx="214" cy="151" r="3.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
        <path d="M226 146h26M226 156h18" stroke="var(--ribbon)" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* sparkles */}
      <g fill="var(--sun)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
        <path className="sparkle" d="M38 52l6 14 14 6-14 6-6 14-6-14-14-6 14-6Z" />
        <path className="sparkle" d="M268 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" />
        <path className="sparkle" d="M292 104l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </g>
      <circle cx="232" cy="88" r="5" fill="var(--ribbon)" />
      <circle cx="70" cy="34" r="4" fill="var(--ribbon)" />
    </svg>
  );
}

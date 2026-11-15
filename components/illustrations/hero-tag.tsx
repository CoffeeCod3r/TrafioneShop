import type { ReactNode } from "react";

/**
 * The page's signature element: a big gift tag ("bilecik") hanging on a ribbon,
 * holding the headline. Pure CSS + SVG, so the text stays real text.
 */
export function HeroTag({ children }: { children: ReactNode }) {
  return (
    <div className="relative pt-10">
      {/* ribbon string from the top edge to the tag's hole */}
      <svg
        viewBox="0 0 120 60"
        className="absolute left-6 top-0 h-14 w-28 text-ribbon"
        aria-hidden
        focusable="false"
      >
        <path d="M4 2c20 4 30 20 36 54" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="tag-swing-in relative -rotate-2 drop-shadow-[6px_8px_0_var(--ink)]">
        <div
          className="relative border-[3px] border-ink bg-white px-6 pb-7 pl-14 pt-7 sm:pl-16"
          style={{
            // notched gift-tag silhouette
            clipPath: "polygon(28px 0, 100% 0, 100% 100%, 28px 100%, 0 calc(100% - 28px), 0 28px)",
            borderRadius: "0 14px 14px 0",
          }}
        >
          <span
            className="absolute left-5 top-1/2 size-5 -translate-y-1/2 rounded-full border-[3px] border-ink bg-paper"
            aria-hidden
          />
          {children}
        </div>
      </div>
    </div>
  );
}

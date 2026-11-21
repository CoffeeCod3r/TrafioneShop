import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getGuide } from "@/lib/guides/data";

/** Cards linking to other guides (used for the "Zobacz też" block and on the hub page). */
export function GuideCards({ slugs }: { slugs: readonly string[] }) {
  const guides = slugs.flatMap((slug) => {
    const guide = getGuide(slug);
    return guide ? [guide] : [];
  });
  return (
    <ul className="grid gap-3">
      {guides.map((guide) => (
        <li key={guide.slug}>
          <Link
            href={`/poradniki/${guide.slug}`}
            className="flex min-h-14 items-start gap-3 rounded-2xl border-2 border-border bg-card p-4 transition-colors hover:bg-secondary"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold leading-snug">{guide.h1}</span>
              <span className="text-sm text-muted-foreground">{guide.teaser}</span>
            </span>
            <ArrowRight className="mt-1 size-5 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

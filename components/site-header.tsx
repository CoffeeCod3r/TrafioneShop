import Link from "next/link";

import { GiftTagMark } from "@/components/illustrations/gift-tag-mark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-xl font-bold tracking-tight">
          <GiftTagMark className="size-8" />
          Prezentownik AI
        </Link>
      </div>
    </header>
  );
}

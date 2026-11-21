import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
        <Link href="/" aria-label="Prezentoskop – strona główna" className="logo-link flex min-h-11 items-center">
          <Logo />
        </Link>
      </div>
    </header>
  );
}

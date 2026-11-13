import Link from "next/link";
import { Gift } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Gift className="size-5" aria-hidden />
          Prezentownik AI
        </Link>
      </div>
    </header>
  );
}

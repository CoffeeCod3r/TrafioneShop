import Link from "next/link";

import { CookieSettingsButton } from "@/components/consent/cookie-banner";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
        <p>Strona zawiera linki partnerskie.</p>
        <nav className="flex flex-wrap gap-x-6">
          <Link href="/regulamin" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            Regulamin
          </Link>
          <Link href="/prywatnosc" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            Polityka prywatności
          </Link>
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  );
}

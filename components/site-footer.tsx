import { cacheLife } from "next/cache";
import Link from "next/link";

import { CookieSettingsButton } from "@/components/consent/cookie-banner";
import { SITE_NAME } from "@/lib/site";

const LINKS = [
  { href: "/regulamin", label: "Regulamin" },
  { href: "/prywatnosc", label: "Polityka prywatności" },
  { href: "/o-nas", label: "O nas" },
  { href: "/jak-zarabiamy", label: "Jak zarabiamy" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/poradniki", label: "Poradniki" },
];

/** Current year, computed once a day (cached), so the footer never makes a page dynamic. */
async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
        <p>Strona może zawierać linki partnerskie.</p>
        <nav aria-label="Informacje o serwisie" className="flex flex-wrap gap-x-6">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
          <CookieSettingsButton />
        </nav>
        <p>
          © <CurrentYear /> {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}

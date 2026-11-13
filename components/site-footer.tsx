import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
        <p>Strona zawiera linki partnerskie.</p>
        <nav className="flex gap-6">
          <Link href="/regulamin" className="py-2 underline-offset-4 hover:underline">
            Regulamin
          </Link>
          <Link href="/prywatnosc" className="py-2 underline-offset-4 hover:underline">
            Polityka prywatności
          </Link>
        </nav>
      </div>
    </footer>
  );
}

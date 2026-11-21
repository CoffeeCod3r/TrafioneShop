import type { Metadata } from "next";
import Link from "next/link";
import { Gift } from "lucide-react";

import { GuideCards } from "@/components/guides/guide-links";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/lib/guides/data";

const DESCRIPTION =
  "Poradniki prezentowe Prezentoskopu: prezent dla taty, mamy, dziewczyny, chłopaka, gracza i kawosza, pomysły do 50 zł, na ostatnią chwilę i prezenty-przeżycia.";

export const metadata: Metadata = {
  title: "Poradniki prezentowe – Prezentoskop",
  description: DESCRIPTION,
  alternates: { canonical: "/poradniki" },
  openGraph: { type: "website", title: "Poradniki prezentowe", description: DESCRIPTION, url: "/poradniki", siteName: "Prezentoskop", locale: "pl_PL" },
};

export default function GuidesHubPage() {
  return (
    <div className="flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Poradniki prezentowe</h1>
        <p className="text-lg leading-relaxed">
          Krótkie poradniki na każdą okazję i do każdego budżetu: jak wybrać prezent, na co uważać i co warto sprawdzić. W
          każdym znajdziesz też propozycje produktów z polskich sklepów, z ceną sprawdzoną na stronie produktu.
        </p>
      </header>

      <GuideCards slugs={GUIDES.map((guide) => guide.slug)} />

      <section className="flex flex-col gap-3 rounded-2xl border-[3px] border-ink bg-mint p-5 shadow-[5px_5px_0_var(--ink)]">
        <h2 className="text-xl font-bold">Wolisz, żeby AI wybrało za Ciebie?</h2>
        <p>Odpowiedz na kilka pytań o osobie, której kupujesz prezent, a dobierzemy pięć propozycji w Twoim budżecie.</p>
        <Button asChild size="xl">
          <Link href="/quiz?utm_source=poradniki">
            <Gift aria-hidden />
            Nie wiesz, co wybrać? Zrób quiz w 60 sekund
          </Link>
        </Button>
      </section>
    </div>
  );
}

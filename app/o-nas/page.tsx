import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage } from "@/components/info/info-page";
import { SITE_NAME } from "@/lib/site";

const DESCRIPTION =
  "Kim jestem, po co powstał Prezentoskop i jak działa AI, które dobiera prezenty z polskich sklepów. Bez obietnic, których nie spełniamy.";

export const metadata: Metadata = {
  title: `O nas – ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: "/o-nas" },
  openGraph: { type: "website", title: `O nas – ${SITE_NAME}`, description: DESCRIPTION, url: "/o-nas", siteName: SITE_NAME, locale: "pl_PL" },
};

export default function AboutPage() {
  return (
    <InfoPage title="O nas" lead="Cześć, jestem Michał z Opola i prowadzę Prezentoskop.">
      <section className="flex flex-col gap-3">
        <h2>Po co powstał Prezentoskop</h2>
        <p>
          Wybór prezentu potrafi zająć cały wieczór: przeglądanie sklepów, porównywanie, wątpliwości, czy to na pewno
          trafi. Prezentoskop ma to skrócić do około minuty. Odpowiadasz na kilka pytań o osobie, której kupujesz prezent,
          a my pokazujemy konkretne produkty z polskich sklepów, z ceną sprawdzoną na stronie produktu i linkiem do
          zakupu.
        </p>
        <p>
          Nie jesteśmy sklepem. Niczego nie sprzedajemy ani nie wysyłamy: pomagamy wybrać, a kupujesz w sklepie, do
          którego prowadzi link.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Jak działa AI</h2>
        <ul>
          <li>
            <strong>Quiz.</strong> Odpowiadasz na kilka pytań (dla kogo, budżet, okazja, zainteresowania, styl życia, typ
            prezentu). Możesz też opisać osobę kilkoma słowami i dodać zdjęcie. Oba pola są opcjonalne.
          </li>
          <li>
            <strong>Zdjęcie.</strong> Służy tylko do opisania stylu: ubrań, kolorów, dodatków i przedmiotów. Nie oceniamy
            twarzy, wieku ani wyglądu, nie analizujemy zdjęć dzieci i nigdzie nie zapisujemy zdjęcia.
          </li>
          <li>
            <strong>Wyszukiwanie.</strong> AI (model Claude firmy Anthropic) przeszukuje strony zaufanych polskich sklepów
            z naszej listy, otwiera strony produktów i odczytuje cenę oraz dostępność.
          </li>
          <li>
            <strong>Sprawdzanie.</strong> Po naszej stronie weryfikujemy, że link prowadzi do sklepu z listy i że strona
            produktu została faktycznie otwarta. Produkty, które tego nie spełniają, nie trafiają do wyniku. Przy
            produkcie widzisz datę sprawdzenia ceny.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Czego nie obiecujemy</h2>
        <ul>
          <li>AI może się pomylić i nie zna Twojej bliskiej osoby tak dobrze jak Ty. Dlatego do każdej propozycji dodajemy krótkie „dlaczego”, żebyś mógł ocenić trafność.</li>
          <li>Ceny i dostępność mogą się zmienić po sprawdzeniu. Wiążąca jest cena w sklepie w chwili zakupu.</li>
          <li>Nie gwarantujemy, że prezent się spodoba, ani że wskażemy najtańszą ofertę w internecie.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Co dalej</h2>
        <p>
          Jeśli chcesz wiedzieć, na czym zarabiamy, przeczytaj{" "}
          <Link href="/jak-zarabiamy" className="underline underline-offset-4">
            jak zarabiamy
          </Link>
          . Masz pytanie albo uwagę? Napisz przez{" "}
          <Link href="/kontakt" className="underline underline-offset-4">
            formularz kontaktowy
          </Link>
          .
        </p>
      </section>
    </InfoPage>
  );
}

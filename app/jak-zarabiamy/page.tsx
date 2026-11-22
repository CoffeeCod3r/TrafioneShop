import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage } from "@/components/info/info-page";
import { arePaymentsEnabled } from "@/lib/payments-gate";
import { SITE_NAME } from "@/lib/site";

const DESCRIPTION =
  "Uczciwie o tym, na czym zarabia Prezentoskop: linki partnerskie (prowizja nie zmienia ceny dla Ciebie) i płatne opcje z większą liczbą propozycji.";

export const metadata: Metadata = {
  title: `Jak zarabiamy – ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: "/jak-zarabiamy" },
  openGraph: { type: "website", title: `Jak zarabiamy – ${SITE_NAME}`, description: DESCRIPTION, url: "/jak-zarabiamy", siteName: SITE_NAME, locale: "pl_PL" },
};

export default function HowWeEarnPage() {
  const paymentsOpen = arePaymentsEnabled();
  return (
    <InfoPage
      title="Jak zarabiamy"
      lead="Wynik w Prezentoskopie jest darmowy. Poniżej wyjaśniamy, z czego utrzymujemy serwis, żebyś wiedział, co kryje się za linkami."
    >
      <section className="flex flex-col gap-3">
        <h2>Linki partnerskie</h2>
        <p>
          Gdy klikniesz „Zobacz w sklepie” i kupisz produkt, sklep lub sieć afiliacyjna może zapłacić nam prowizję.{" "}
          <strong>Cena dla Ciebie jest taka sama jak bez naszego linku</strong>: prowizję płaci sklep ze swojej marży,
          nie Ty.
        </p>
        <ul>
          <li>Nie każdy link jest partnerski. Jeśli nie mamy umowy ze sklepem, nic nie zarabiamy, a link prowadzi prosto do sklepu.</li>
          <li>Linki oznaczamy (atrybut rel=&quot;sponsored&quot;), a na stronie przypominamy o nich w stopce i przy propozycjach.</li>
          <li>
            Zapisujemy kliknięcie w produkt (który wynik, który produkt, czas i źródło), żeby rozliczyć się z programami
            partnerskimi i liczyć statystyki. Szczegóły w{" "}
            <Link href="/prywatnosc" className="underline underline-offset-4">
              polityce prywatności
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Płatne opcje</h2>
        <p>
          Oprócz darmowego wyniku (5 propozycji) oferujemy płatną opcję „Więcej propozycji”: 10 prezentów z całego
          internetu zamiast 5, bez powtórzeń z wyniku darmowego, oraz 3 dedykacje na bilecik. Można ją kupić jako jedno
          wyszukiwanie albo w pakiecie dla kilku osób. To jednorazowa płatność, bez abonamentu, a cena widoczna przy
          przycisku jest ceną, którą płacisz.
        </p>
        <ul>
          <li>Wynik darmowy zostaje darmowy i nie jest ograniczany po to, żeby skłonić do zakupu.</li>
          <li>Jeśli przy pojedynczym wyszukiwaniu nie znajdziemy co najmniej 5 sprawdzonych produktów, zwracamy pieniądze automatycznie.</li>
          <li>
            {paymentsOpen
              ? "Szczegóły i warunki są w regulaminie."
              : "Ta opcja jest jeszcze w przygotowaniu: na stronie wyników zobaczysz informację „już wkrótce”."}
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Jak AI wybiera produkty</h2>
        <p>
          AI nie dostaje informacji o tym, które sklepy są partnerskie ani ile wynosi prowizja. Wybiera produkty według
          dopasowania do osoby: jej zainteresowań, stylu, okazji, opisu i budżetu.
        </p>
        <p>
          To samo dotyczy wyboru z naszej bazy produktów (np. po przekroczeniu dziennego limitu kosztów albo gdy
          wyszukiwanie się nie uda): kolejność propozycji zależy od dopasowania do osoby, a nie od wysokości prowizji.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Pytania</h2>
        <p>
          Czegoś tu brakuje albo coś jest niejasne? Napisz przez{" "}
          <Link href="/kontakt" className="underline underline-offset-4">
            formularz kontaktowy
          </Link>
          . Więcej o nas przeczytasz na stronie{" "}
          <Link href="/o-nas" className="underline underline-offset-4">
            O nas
          </Link>
          .
        </p>
      </section>
    </InfoPage>
  );
}

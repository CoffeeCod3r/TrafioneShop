import type { Metadata } from "next";
import Link from "next/link";

import { Fill, LegalPage, OwnerData } from "@/components/legal/legal";

export const metadata: Metadata = { title: "Regulamin – Prezentownik AI" };

/** DRAFT – to be verified by the owner (and ideally a lawyer) before launch. */
export default function TermsPage() {
  return (
    <LegalPage title="Regulamin serwisu Prezentownik AI" updated="14 listopada 2026 r.">
      <section>
        <h2>§ 1. Usługodawca i kontakt</h2>
        <p>Serwis Prezentownik AI, dostępny pod adresem <Fill>[ADRES STRONY]</Fill>, prowadzi:</p>
        <OwnerData />
        <p>
          Kontakt w każdej sprawie, w tym reklamacje: <Fill>[E-MAIL]</Fill>.
        </p>
      </section>

      <section>
        <h2>§ 2. Czym jest serwis</h2>
        <ul>
          <li>
            Serwis pomaga dobrać prezent: na podstawie odpowiedzi z quizu i opcjonalnego zdjęcia AI przygotowuje
            profil stylu obdarowanego i proponuje prezenty.
          </li>
          <li>
            <strong>Nie sprzedajemy produktów.</strong> Sprzedawcą jest zawsze sklep, do którego prowadzi link. Umowę
            kupna zawierasz ze sklepem, na jego warunkach (cena, dostawa, zwroty, reklamacje towaru).
          </li>
          <li>
            Propozycje AI są sugestiami. Dokładamy starań, żeby były trafne, ale AI może się pomylić. Przed zakupem
            sprawdź opis, cenę i warunki w sklepie.
          </li>
          <li>
            Wymagania techniczne: aktualna przeglądarka internetowa z włączonym JavaScriptem i dostęp do internetu;
            konto w serwisie ani w Stripe nie jest wymagane.
          </li>
          <li>
            Z serwisu mogą korzystać osoby, które ukończyły <Fill>[16]</Fill> lat. Płatne wyszukiwanie mogą zamawiać
            wyłącznie osoby pełnoletnie.
          </li>
        </ul>
      </section>

      <section>
        <h2>§ 3. Usługa darmowa</h2>
        <ul>
          <li>
            Obejmuje quiz (6 pytań), opcjonalną analizę zdjęcia, profil stylu i 5 propozycji prezentów z katalogu
            sklepów partnerskich, a także możliwość udostępnienia wyniku.
          </li>
          <li>
            Darmowe wyniki zawierają <strong>linki partnerskie</strong>: jeśli kupisz coś po kliknięciu, możemy dostać
            prowizję od sklepu. Cena dla Ciebie się nie zmienia.
          </li>
          <li>
            Ceny i dostępność w darmowych wynikach pochodzą z danych przekazywanych przez sklepy (aktualizowanych raz na
            dobę) i mogą się różnić od aktualnych. Wiążąca jest cena w sklepie.
          </li>
          <li>Umowa o usługę darmową zawierana jest z chwilą rozpoczęcia quizu i kończy się po wyświetleniu wyniku.</li>
        </ul>
      </section>

      <section>
        <h2>§ 4. Zdjęcia</h2>
        <ul>
          <li>Możesz dodać wyłącznie swoje zdjęcie albo zdjęcie osoby, która się na to zgodziła.</li>
          <li>Nie wolno dodawać zdjęć dzieci ani treści niezgodnych z prawem lub naruszających cudze prawa.</li>
          <li>
            Zdjęcie służy wyłącznie do analizy stylu przez AI i nie jest przez nas zapisywane. Szczegóły w{" "}
            <Link href="/prywatnosc" className="underline">polityce prywatności</Link>.
          </li>
          <li>Obowiązują dzienne limity analiz (obecnie 3 ze zdjęciem i 20 bez zdjęcia).</li>
        </ul>
      </section>

      <section>
        <h2>§ 5. Płatne wyszukiwanie „Szukaj w całym internecie”</h2>
        <ul>
          <li>
            To usługa cyfrowa. Obejmuje: przeszukanie przez AI zaufanych polskich sklepów spoza naszego katalogu,
            sprawdzenie na stronie każdego produktu ceny i dostępności, przedstawienie 5–10 propozycji oraz 3 dedykacji
            na bilecik.
          </li>
          <li>
            Dostępne są dwie oferty: <strong>jedno wyszukiwanie</strong> (4,99 zł brutto) oraz{" "}
            <strong>pakiet na 8 osób</strong>, czyli 8 wyszukiwań dla 8 różnych wyników. Pakiet kosztuje 12,99 zł brutto
            w promocji do 27 listopada 2026 r., do godz. 23:59, a po jej zakończeniu 19,99 zł brutto. Cena widoczna
            przy przycisku płatności jest ceną, którą zapłacisz. Płatność jest jednorazowa, przez Stripe (BLIK lub
            karta). Jeden wynik można opłacić tylko raz.
          </li>
          <li>
            Pakiet nie ma terminu ważności ani konta: dostęp do niego daje przeglądarka, w której go kupiono, oraz link
            do pakietu pokazywany po zakupie (nie udostępniaj go). Wyszukiwanie z pakietu, które nie znajdzie co
            najmniej 5 sprawdzonych produktów, wraca do pakietu. <Fill>[do weryfikacji przez prawnika: zwrot za
            niewykorzystane wyszukiwania z pakietu i prawo odstąpienia]</Fill>
          </li>
          <li>Umowa zostaje zawarta z chwilą potwierdzenia płatności. Wyniki pojawiają się zwykle w ciągu kilku minut.</li>
          <li>
            <strong>Ceny i dostępność są aktualne na chwilę sprawdzenia</strong> (godzina sprawdzenia jest podana przy
            każdym produkcie). Mogą się później zmienić, a wiążąca jest cena w sklepie w chwili zakupu.
          </li>
          <li>
            <strong>Sprzedawcą produktów jest dany sklep</strong>, nie my. Część linków może być linkami partnerskimi.
          </li>
          <li>
            <strong>Automatyczny zwrot</strong>: jeśli przy pojedynczym wyszukiwaniu nie znajdziemy co najmniej 5
            sprawdzonych produktów albo wystąpi błąd, automatycznie zwracamy całą zapłaconą kwotę tą samą metodą
            płatności. Nie musisz o to prosić.
            Zwrot zlecamy od razu, a jego zaksięgowanie zależy od banku (zwykle do <Fill>[10]</Fill> dni roboczych).
            Darmowe wyniki pozostają dostępne.
          </li>
        </ul>
      </section>

      <section>
        <h2>§ 6. Prawo odstąpienia od umowy</h2>
        <p>
          Konsumentowi co do zasady przysługuje prawo odstąpienia od umowy zawartej na odległość w ciągu 14 dni. Przed
          płatnością prosimy o wyraźną zgodę na rozpoczęcie usługi i dostarczenie treści cyfrowej przed upływem tego
          terminu. Po jej wyrażeniu i wykonaniu usługi prawo odstąpienia nie przysługuje (art. 38 ust. 1 pkt 1 i 13
          ustawy o prawach konsumenta – <Fill>[do weryfikacji przez prawnika]</Fill>). Nie wpływa to na automatyczny
          zwrot z § 5 ani na prawa z tytułu niezgodności usługi z umową.
        </p>
      </section>

      <section>
        <h2>§ 7. Reklamacje</h2>
        <ul>
          <li>
            Jeśli usługa nie działa tak, jak opisano, napisz na <Fill>[E-MAIL]</Fill>. Podaj adres wyniku (link) lub kod
            z karty wyniku oraz opis problemu.
          </li>
          <li>Odpowiemy w ciągu 14 dni od otrzymania reklamacji.</li>
          <li>
            Konsumentowi przysługują uprawnienia z tytułu niezgodności treści lub usługi cyfrowej z umową, przewidziane
            w ustawie o prawach konsumenta (m.in. doprowadzenie do zgodności, obniżenie ceny, odstąpienie od umowy).
          </li>
          <li>
            Reklamacje dotyczące kupionych produktów (towarów) składasz w sklepie, który je sprzedał.
          </li>
          <li>
            Konsument może skorzystać z pozasądowych sposobów rozpatrywania sporów, np. z pomocy miejskiego lub
            powiatowego rzecznika konsumentów albo Wojewódzkiego Inspektoratu Inspekcji Handlowej.
          </li>
        </ul>
      </section>

      <section>
        <h2>§ 8. Przypomnienia e-mail</h2>
        <p>
          Zapis na przypomnienia jest dobrowolny i wymaga zgody oraz potwierdzenia kliknięciem w link w e-mailu. Każda
          wiadomość zawiera link do wypisania się, który usuwa Twój adres z listy.
        </p>
      </section>

      <section>
        <h2>§ 9. Zasady korzystania</h2>
        <ul>
          <li>Nie wolno korzystać z serwisu w sposób zakłócający jego działanie, automatycznie (boty) ani niezgodnie z prawem.</li>
          <li>Możemy czasowo ograniczyć dostęp przy próbach nadużyć.</li>
        </ul>
      </section>

      <section>
        <h2>§ 10. Postanowienia końcowe</h2>
        <ul>
          <li>Regulamin może się zmienić. Zmiany nie dotyczą usług już opłaconych.</li>
          <li>W sprawach nieuregulowanych stosuje się prawo polskie, w szczególności Kodeks cywilny, ustawę o prawach konsumenta i ustawę o świadczeniu usług drogą elektroniczną.</li>
          <li>Postanowienia regulaminu nie ograniczają praw konsumenta wynikających z przepisów prawa.</li>
        </ul>
      </section>
    </LegalPage>
  );
}

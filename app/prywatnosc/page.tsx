import type { Metadata } from "next";
import Link from "next/link";

import { Fill, LegalPage, OwnerData } from "@/components/legal/legal";

export const metadata: Metadata = { title: "Polityka prywatności – Prezentoskop" };

/** DRAFT – to be verified by the owner (and ideally a lawyer) before launch. */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Polityka prywatności" updated="14 listopada 2026 r.">
      <section>
        <h2>1. Kto jest administratorem danych</h2>
        <p>Administratorem danych osobowych użytkowników serwisu Prezentoskop jest:</p>
        <OwnerData />
        <p>
          W sprawach danych osobowych możesz pisać na adres <Fill>[E-MAIL]</Fill>.
        </p>
      </section>

      <section>
        <h2>2. Zdjęcie osoby obdarowanej</h2>
        <ul>
          <li>Dodanie zdjęcia jest dobrowolne. Quiz działa również bez niego.</li>
          <li>
            Zdjęcie jest zmniejszane w Twojej przeglądarce (co usuwa też metadane, np. lokalizację), a następnie
            przesyłane wyłącznie do dostawcy AI, firmy Anthropic, w jednym celu: przeanalizowania stylu (ubrania,
            kolory, dodatki, otoczenie) na potrzeby doboru prezentu.
          </li>
          <li>
            <strong>Nie zapisujemy zdjęcia</strong>: nie trafia do naszej bazy danych, na dysk, do logów ani do
            narzędzi analitycznych. Zapisujemy tylko wynik analizy, czyli krótki opis stylu i tagi zainteresowań.
          </li>
          <li>
            Anthropic przetwarza dane jako nasz podmiot przetwarzający. Według informacji Anthropic dane przesyłane
            przez API są automatycznie usuwane z jego systemów w ciągu 30 dni, z wyjątkami opisanymi w jego zasadach
            (np. naruszenia zasad korzystania). Anthropic domyślnie nie trenuje modeli na danych z API.
          </li>
          <li>
            AI nie ocenia twarzy, wieku, wyglądu ani innych cech ciała i nie próbuje ustalić tożsamości osoby. Nie
            analizujemy zdjęć dzieci: jeśli na zdjęciu może być osoba niepełnoletnia, zdjęcie jest pomijane.
          </li>
          <li>
            Dodając zdjęcie, potwierdzasz, że to Twoje zdjęcie albo masz zgodę osoby, która jest na nim widoczna.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Płatne wyszukiwanie „Szukaj w całym internecie”</h2>
        <p>
          Przy płatnym wyszukiwaniu do AI (Anthropic) przekazujemy wyłącznie zapisany profil stylu, tagi i odpowiedzi z
          quizu oraz nazwy produktów z darmowych wyników. <strong>Zdjęcie nie jest przekazywane</strong>, bo go nie
          przechowujemy. AI przegląda strony zaufanych polskich sklepów, żeby sprawdzić ceny i dostępność.
        </p>
      </section>

      <section>
        <h2>4. Jakie dane zapisujemy, w jakim celu i na jakiej podstawie</h2>
        <ul>
          <li>
            <strong>Odpowiedzi z quizu i wynik</strong> (dla kogo, budżet, okazja, zainteresowania, styl życia, typ
            prezentu, „co już ma”, profil stylu, wybrane produkty): żeby pokazać wynik pod stałym linkiem i umożliwić
            jego udostępnienie. Podstawa: wykonanie usługi (art. 6 ust. 1 lit. b RODO). Nie zawierają Twojego imienia
            ani e-maila. Przechowujemy je przez <Fill>[OKRES, np. 12 miesięcy]</Fill>.
          </li>
          <li>
            <strong>Kliknięcia w produkty</strong> (który wynik, który produkt, czas, źródło: wynik darmowy, płatny lub
            udostępniony): do rozliczeń z programami partnerskimi i statystyk. Podstawa: nasz prawnie uzasadniony
            interes (art. 6 ust. 1 lit. f RODO). Okres: <Fill>[OKRES, np. 24 miesiące]</Fill>.
          </li>
          <li>
            <strong>Adres e-mail i wybrane okazje</strong> (tylko jeśli zapiszesz się na przypomnienia): do wysyłania
            przypomnień i pomysłów na prezenty. Podstawa: Twoja zgoda (art. 6 ust. 1 lit. a RODO), potwierdzona
            kliknięciem w link w e-mailu. Niepotwierdzone zapisy usuwamy po 7 dniach. Po wypisaniu się usuwamy rekord.
          </li>
          <li>
            <strong>Dane płatności</strong>: płatności obsługuje Stripe. Dane karty lub kodu BLIK wpisujesz na stronie
            Stripe i nie trafiają one do nas. Zapisujemy identyfikator płatności, kwotę, datę i status (opłacona /
            zwrócona). Podstawa: wykonanie umowy oraz obowiązki księgowe i podatkowe (art. 6 ust. 1 lit. b i c RODO).
            Okres: <Fill>[OKRES wynikający z przepisów podatkowych, zwykle 5 lat od końca roku]</Fill>.
          </li>
          <li>
            <strong>Zabezpieczenia</strong>: skrót (hash) adresu IP z tajną solą, żeby ograniczać liczbę analiz i
            zapisów dziennie. Nie przechowujemy samego adresu IP. Skróty usuwamy po 2 dniach. Podstawa: prawnie
            uzasadniony interes w ochronie serwisu przed nadużyciami (art. 6 ust. 1 lit. f RODO).
          </li>
          <li>
            <strong>Zużycie AI</strong>: liczba tokenów, wyszukiwań i pobrań stron. Bez treści zapytań i bez danych
            osobowych.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Linki partnerskie</h2>
        <p>
          Darmowe wyniki (oraz część wyników płatnych) zawierają linki partnerskie. Gdy klikniesz „Zobacz w sklepie”,
          zapisujemy kliknięcie i przekierowujemy Cię do sklepu albo sieci afiliacyjnej. Jeśli coś kupisz, możemy
          dostać prowizję, a cena dla Ciebie się nie zmienia. Sklep i sieć afiliacyjna przetwarzają Twoje dane na
          własnych zasadach (np. mogą zapisać własne pliki cookies), opisanych w ich politykach prywatności.
        </p>
      </section>

      <section id="cookies">
        <h2>6. Pliki cookies i analityka</h2>
        <ul>
          <li>
            <strong>Niezbędne</strong>: zapamiętanie Twojej decyzji o cookies (w pamięci przeglądarki) oraz ochrona
            przed botami (Cloudflare Turnstile). Działają bez zgody.
          </li>
          <li>
            <strong>Analityczne (PostHog)</strong>: <strong>tylko po Twojej zgodzie</strong> wyrażonej w banerze. Bez
            zgody skrypt PostHog w ogóle się nie ładuje. Zbieramy odsłony stron (bez parametrów z adresu), bez nagrań
            sesji i bez automatycznego zbierania kliknięć i treści formularzy. Dane trafiają na serwery PostHog w{" "}
            <Fill>[UE – sprawdź region projektu PostHog]</Fill>.
          </li>
          <li>
            Zgodę możesz w każdej chwili zmienić w stopce strony („Ustawienia cookies”). Wycofanie zgody nie wpływa na
            zgodność z prawem wcześniejszego przetwarzania.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Komu przekazujemy dane</h2>
        <p>Korzystamy z dostawców, którzy przetwarzają dane w naszym imieniu (podmioty przetwarzające):</p>
        <ul>
          <li>Anthropic (analiza AI: profil stylu, dobór prezentów, wyszukiwanie, dedykacje),</li>
          <li>
            Supabase (baza danych, region: <Fill>[REGION, np. UE – Frankfurt]</Fill>),
          </li>
          <li>Vercel (hosting strony),</li>
          <li>Stripe (płatności i zwroty),</li>
          <li>Resend (wysyłka e-maili),</li>
          <li>Cloudflare (ochrona przed botami – Turnstile),</li>
          <li>PostHog (analityka – tylko po zgodzie).</li>
        </ul>
        <p>
          Część dostawców ma siedzibę w USA. Przekazanie danych poza Europejski Obszar Gospodarczy odbywa się na
          podstawie <Fill>[sprawdź: decyzji Komisji Europejskiej (EU-US Data Privacy Framework) lub standardowych
          klauzul umownych – osobno dla każdego dostawcy]</Fill>.
        </p>
      </section>

      <section>
        <h2>8. Twoje prawa</h2>
        <p>
          Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych,
          sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie oraz wycofania zgody w dowolnym
          momencie. Napisz na <Fill>[E-MAIL]</Fill>. Masz też prawo złożyć skargę do Prezesa Urzędu Ochrony Danych
          Osobowych (ul. Stawki 2, 00-193 Warszawa).
        </p>
      </section>

      <section>
        <h2>9. Zautomatyzowane decyzje</h2>
        <p>
          Propozycje prezentów są przygotowywane automatycznie przez AI. Nie wywołują wobec Ciebie skutków prawnych ani
          podobnie istotnych skutków: to wyłącznie sugestie, z których możesz skorzystać lub nie.
        </p>
      </section>

      <section>
        <h2>10. Zmiany polityki</h2>
        <p>
          O istotnych zmianach poinformujemy na tej stronie. Zobacz też <Link href="/regulamin" className="underline">regulamin</Link>.
        </p>
      </section>
    </LegalPage>
  );
}

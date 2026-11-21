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
        <h2>2a. Opis osoby obdarowanej</h2>
        <ul>
          <li>
            W quizie możesz dodać krótki, opcjonalny opis osoby, dla której szukasz prezentu (do 200 znaków). Prosimy,
            żeby nie podawać w nim imienia, nazwiska ani danych kontaktowych. Linki, adresy e-mail i numery telefonu
            automatycznie usuwamy z opisu.
          </li>
          <li>
            Opis trafia do dostawcy AI (Anthropic) w jednym celu: dobrania prezentów. Jest przechowywany razem z
            wynikiem (w odpowiedziach z quizu) i podlega temu samemu okresowi przechowywania. Nie wysyłamy go do
            narzędzi analitycznych.
          </li>
          <li>
            Prosimy, żeby w opisie nie podawać informacji wrażliwych (np. o zdrowiu, religii, poglądach lub
            orientacji). Jeśli się jednak pojawią, AI ma polecenie, żeby nie powtarzać ich w wyniku.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Wyszukiwanie w sklepach (wynik darmowy i płatne „Więcej propozycji”)</h2>
        <p>
          Zarówno przy wyniku darmowym, jak i przy płatnych „Więcej propozycji” do AI (Anthropic) przekazujemy
          wyłącznie zapisany profil stylu, tagi i odpowiedzi z quizu wraz z opisem osoby (przy płatnych dodatkowo nazwy produktów z wyniku
          darmowego). <strong>Zdjęcie nie jest przekazywane</strong>, bo go nie przechowujemy. AI przegląda strony
          zaufanych polskich sklepów, żeby sprawdzić ceny i dostępność. Wyszukiwanie działa w tle na naszym koncie w
          Supabase (funkcja brzegowa), a jego postęp pokazujemy na stronie wyniku.
        </p>
        <p>
          Sprawdzone produkty (nazwa, cena, sklep, adres strony, kategoria, data sprawdzenia) zapisujemy w naszej
          bazie produktów, bez zdjęć produktów ze sklepów. To dane o produktach, nie o Tobie.
        </p>
      </section>

      <section>
        <h2>4. Jakie dane zapisujemy, w jakim celu i na jakiej podstawie</h2>
        <ul>
          <li>
            <strong>Odpowiedzi z quizu i wynik</strong> (dla kogo, budżet, okazja, zainteresowania, styl życia, typ
            prezentu, „co już ma”, opis osoby, profil stylu, wybrane produkty): żeby pokazać wynik pod stałym linkiem i umożliwić
            jego udostępnienie. Podstawa: wykonanie usługi (art. 6 ust. 1 lit. b RODO). Nie zawierają Twojego imienia
            ani e-maila. Przechowujemy je przez <Fill>[OKRES, np. 12 miesięcy]</Fill>.
          </li>
          <li>
            <strong>Pamięć wyników</strong>: skrót (hash) Twoich odpowiedzi z quizu (także opisu osoby), policzony z tajną solą. Nie zawiera
            zdjęcia (przy zdjęciu do skrótu trafiają tylko tagi z profilu stylu) i nie da się z niego odczytać
            odpowiedzi. Dzięki niemu ten sam quiz w ciągu 24 godzin dostaje gotowe, sprawdzone produkty bez nowego
            wyszukiwania, co ogranicza koszty. Podstawa: prawnie uzasadniony interes (art. 6 ust. 1 lit. f RODO).
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
            <strong>Zabezpieczenia</strong>: skrót (hash) adresu IP z tajną solą oraz losowy identyfikator urządzenia w
            pliku cookie (niezbędny, bez danych osobowych), żeby ograniczać liczbę analiz, zapisów i darmowych
            wyszukiwań w sieci (3 na dobę) dziennie. Nie przechowujemy samego adresu IP. Skróty usuwamy po 2 dniach. Podstawa: prawnie
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
          Niektóre linki w wynikach (darmowych i płatnych) mogą być linkami partnerskimi. Gdy klikniesz „Zobacz w sklepie”,
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
          <li>Anthropic (analiza AI: profil stylu, dobór prezentów, wyszukiwanie w sklepach, dedykacje),</li>
          <li>
            Supabase (baza danych i funkcja brzegowa uruchamiająca wyszukiwanie, region: <Fill>[REGION, np. UE – Frankfurt]</Fill>),
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

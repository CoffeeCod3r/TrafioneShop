# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-11-21

> Źródła: opis produktu od właściciela (2026-11-21) oraz kod i teksty serwisu. Tam, gdzie nie ma jeszcze danych
> (opinie klientów, metryki), jest to napisane wprost: nic nie jest zmyślone. Pola oznaczone ⚠ wymagają decyzji
> albo poprawki w kodzie.

## Product Overview
**One-liner:** Prezentoskop to polski doradca prezentowy z AI: krótki quiz i w około minutę dostajesz 5 prawdziwych
prezentów z polskich sklepów, z ceną sprawdzoną na stronie produktu i linkiem.

**What it does:** Użytkownik odpowiada na pytania o osobie, której kupuje prezent (dla kogo, budżet, okazja,
zainteresowania, styl życia, typ prezentu, co już ma), może opisać ją własnymi słowami (do 200 znaków) i opcjonalnie
dodać zdjęcie (AI patrzy tylko na styl, ubrania i przedmioty; zdjęcia nigdzie nie zapisujemy). AI przeszukuje zaufane
polskie sklepy, otwiera strony produktów, sprawdza cenę i dostępność i zwraca 5 propozycji z krótkim „dlaczego” i
linkiem „Zobacz w sklepie”. Płatna opcja „Więcej propozycji” daje 10 kolejnych prezentów z całego internetu (bez
powtórzeń z wyniku darmowego) i 3 dedykacje na bilecik.

**Product category:** doradca / wyszukiwarka pomysłów na prezent (poszukiwane jako „pomysł na prezent”, „co kupić
na prezent dla mamy / taty / dziewczyny”, „prezent na święta do 100 zł”).

**Product type:** serwis webowy (mobile-first) z płatnymi dodatkami jednorazowymi; bez kont użytkowników.

**Business model:**
- Wynik darmowy: 5 sprawdzonych produktów z polskich sklepów.
- „Więcej propozycji” (płatne, Stripe: BLIK lub karta):
  - jedno wyszukiwanie: 10 propozycji z całego internetu + 3 dedykacje: **4,99 zł**,
  - pakiet: **14,99 zł** za 10 takich wyszukiwań dla różnych osób (bez konta, dostęp przez przeglądarkę i link).
  - Oferta jest zgodna z kodem ([lib/offers.ts](../lib/offers.ts), id `pack10`) i z regulaminem. Wcześniejszy pakiet
    „8 za 12,99 zł / 19,99 zł” jest wycofany (tylko dla zakupów już zrealizowanych).
  - ⚠ Płatności są obecnie wyłączone (`PAYMENTS_ENABLED=false`): na stronie jest „Więcej propozycji z całego
    internetu – już wkrótce”. Nie reklamować płatnej opcji, dopóki się nie włączy.
- Gwarancja techniczna: jeśli przy pojedynczym wyszukiwaniu nie znajdziemy co najmniej 5 sprawdzonych produktów,
  płatność jest zwracana automatycznie; przy pakiecie wyszukiwanie wraca do pakietu.
- Przychód z prowizji afiliacyjnych: obecnie żadnego (żaden sklep nie ma jeszcze linku partnerskiego). Gdy się
  pojawią, linki są oznaczone i cena dla kupującego się nie zmienia.

## Target Audience
**Target companies:** nie dotyczy (B2C).

**Decision-makers:** Polacy w wieku 18–35, którzy kupują prezenty dla bliskich i znajomych, głównie na święta
(Boże Narodzenie, Mikołajki), a także na urodziny i inne okazje.

**Primary use case:** „Muszę kupić prezent, nie wiem co, i boję się, że nie trafię.”

**Jobs to be done:**
- Szybko dostać konkretne, kupowalne pomysły (a nie ogólne listy), dopasowane do tej jednej osoby.
- Mieć pewność, że produkt jest dostępny i ile kosztuje, zanim kliknie do sklepu.
- Zmieścić się w budżecie i nie dać „nietrafionego prezentu”.

**Use cases:**
- Prezent dla mamy, taty, dziewczyny, chłopaka, przyjaciela, szefa, dziadków (opcje w quizie).
- Okazje w quizie: Święta, Mikołajki, Urodziny, inna.
- Budżety w quizie: do 50, 100, 200, 500 zł.
- Osoba „trudna do obdarowania” (ma wszystko, ma nietypowe zainteresowania): do tego służy opis własnymi słowami.
- Kilka prezentów naraz (rodzina, znajomi): pakiet wyszukiwań.

## Personas
Nie dotyczy (B2C, jedna osoba decyduje i płaci).

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Kupujący 18–35 | czas, trafność, budżet | nie wie, co kupić; nie ufa listom „top 10” | 5 prawdziwych produktów z ceną i linkiem w ok. minutę |

## Problems & Pain Points
**Core problem:** wybór prezentu dla konkretnej osoby jest stresujący, a gotowe poradniki są ogólne.

**Why alternatives fall short:**
- Darmowe czaty AI: dają pomysły „w ogóle” (kategorie, hasła), często bez prawdziwych produktów, bez ceny i dostępności
  w polskich sklepach, a linki bywają zmyślone. Użytkownik sam musi szukać dalej.
- Poradniki prezentowe sklepów: promują asortyment jednego sklepu, są ogólne, nie znają osoby.
- Ręczne szukanie po sklepach: godziny przewijania.

**What it costs them:** czas (wieczory przed świętami), pieniądze (nietrafiony prezent, zwrot), zawstydzenie.

**Emotional tension:** presja „trzeba trafić”, strach przed rozczarowaniem, brak pomysłów, brak czasu.

## Competitive Landscape
**Direct:** brak dużego polskiego odpowiednika znanego nam z nazwy ⚠ (do uzupełnienia po przeglądzie rynku).

**Secondary:** darmowe czaty AI (ogólne asystenty) — dają pomysły, ale zwykle bez sprawdzonych, kupowalnych produktów
z ceną i linkiem do polskiego sklepu.

**Indirect:** poradniki i listy prezentów w sklepach i blogach, szukanie w wyszukiwarce, pytanie znajomych,
karty podarunkowe (bezpieczna, ale mało osobista opcja).

## Differentiation
**Key differentiators:**
- Prawdziwe produkty z polskich sklepów: AI faktycznie otwiera strony produktów, a serwer weryfikuje, że link jest
  z dozwolonej domeny i że strona została otwarta (nie wierzymy AI na słowo).
- Cena i dostępność sprawdzone na stronie produktu, z datą („cena sprawdzona …”).
- Dopasowanie do osoby: quiz + opis własnymi słowami + opcjonalne zdjęcie (tylko styl i przedmioty).
- Szybko: wynik w około minutę, na telefonie, bez konta.
- Uczciwie: wynik darmowy działa; płatna opcja daje więcej, a przy niepowodzeniu jest zwrot.
- Prywatność: zdjęć nie zapisujemy, nie wysyłamy do analityki.

**How we do it differently:** AI z wyszukiwarką działa w tle na zaufanej liście sklepów (`allowed_shops`: dziś 33 domeny w bazie,
po drugim seedzie 63), a wyniki przechodzą weryfikację po stronie serwera.

**Why that's better:** użytkownik dostaje coś, w co może od razu kliknąć i kupić, a nie listę pomysłów do dalszego
szukania.

**Why customers choose us:** „prawdziwe, sprawdzone produkty z ceną i linkiem w 60 sekund”.

## Objections
| Objection | Response |
|-----------|----------|
| „Po co mi to, jak mam ChatGPT?” | Czat podpowie hasła. My podajemy konkretne produkty z polskich sklepów z ceną sprawdzoną na stronie i linkiem. |
| „Czy AI trafi w gust?” | Nie obiecujemy, że zawsze trafi: dajemy 5 propozycji z „dlaczego”; im więcej wiesz (opis, zdjęcie), tym lepiej. |
| „Co ze zdjęciem?” | Opcjonalne, nie zapisujemy go. AI opisuje tylko styl, ubrania i przedmioty, nie twarz ani wygląd. |
| „Czy ceny są aktualne?” | Aktualne w chwili sprawdzenia (podajemy datę); wiążąca jest cena w sklepie. |
| „Czy za to płacę?” | Wynik darmowy zostaje darmowy. Płatne „Więcej propozycji” jest opcją; przy niepowodzeniu zwrot lub wyszukiwanie wraca do pakietu. |

**Anti-persona:** osoby szukające najniższej ceny w całym internecie (nie porównujemy cen), kupujący prezenty luksusowe
ponad 500 zł (budżety w quizie kończą się na 500 zł), osoby chcące, żeby ktoś kupił i wysłał prezent (tylko
doradzamy, sprzedaje sklep), kupujący spoza Polski.

## Switching Dynamics
**Push:** brak pomysłów, brak czasu, ogólne podpowiedzi czatów i poradników, niepewność, czy produkt jest dostępny.
**Pull:** konkretne produkty z ceną i linkiem, dopasowanie do osoby, minuta zamiast godzin, wynik darmowy.
**Habit:** „zapytam ChatGPT”, „poszukam w Empiku/Allegro”, „kupię kartę podarunkową”.
**Anxiety:** „czy to nie kolejny spam z linkami afiliacyjnymi?”, „czy AI zna się na moim kimś?”, „co z moim zdjęciem?”
→ odpowiadamy jawnym oznaczeniem linków, brakiem zapisu zdjęć i „dlaczego” przy każdej propozycji.

## Customer Language
⚠ Brak jeszcze cytatów prawdziwych użytkowników. Poniżej **hipotezy** (nie cytaty), do zastąpienia po pierwszych
komentarzach, wiadomościach i odpowiedziach z ankiet.

**How they describe the problem (hipotezy):**
- „nie wiem, co kupić”
- „boję się, że nie trafię”
- „ma już wszystko”
- „a przecież to już za tydzień”

**How they describe us:** brak danych (uzupełnić po pierwszych opiniach).

**Words to use:** prezent, pomysł na prezent, trafiony prezent, sprawdzona cena, polskie sklepy, w minutę,
dla mamy / taty / dziewczyny…, na święta, „dlaczego” (przy propozycjach).

**Words to avoid:** „gwarancja trafienia”, „najlepszy prezent”, „najtańszy”, „AI zna Twoją bliską osobę”,
„idealny dla każdego”, „analizujemy twarz”, „oficjalny partner” (jeśli nim nie jesteśmy), „AI wie wszystko”.

**Glossary:**
| Term | Meaning |
|------|---------|
| Wynik darmowy | 5 sprawdzonych produktów dobranych przez AI z polskich sklepów |
| Więcej propozycji | płatne: 10 prezentów z całego internetu + 3 dedykacje, bez powtórzeń z wyniku darmowego |
| Pakiet | 10 płatnych wyszukiwań („Więcej propozycji”) dla 10 różnych osób, 14,99 zł, bez konta |
| cena sprawdzona | data, kiedy AI otworzyło stronę produktu i odczytało cenę |
| dedykacja | krótki tekst na bilecik (3 propozycje) |

## Brand Voice
| Attribute | Means | Doesn't mean | Example line |
|-----------|-------|--------------|--------------|
| Ciepły | mówi do człowieka, który się stresuje; uspokaja | lukrowany, przesłodzony, „kochani!” | „Mały prezent od serca, z najlepszymi życzeniami.” |
| Z humorem | lekki żart o hobby i przedmiotach, nigdy o osobie | żarty z wyglądu, wieku, cech ciała; ironia kosztem użytkownika | „Wygląda na to, że to prawdziwy entuzjasta swoich pasji.” (zdanie z trybu demo; ⚠ zastąpić prawdziwą linią z wyniku po starcie) |
| Konkretny | liczby, nazwy, data sprawdzenia, „dlaczego” | żargon AI, ogólniki („idealny dla każdego”) | „Zdjęcie jest opcjonalne i nigdzie go nie zapisujemy.” |
| Uczciwy | mówi, co robimy, a czego nie; przyznaje błędy | obietnice bez pokrycia, ukryte warunki | „Przepraszamy! Tym razem nie udało się znaleźć co najmniej 5 sprawdzonych prezentów, więc automatycznie zwróciliśmy pieniądze.” |

**Tone by context:**
- Support: spokojny i konkretny, bez żartów przy problemie z płatnością lub zwrotem.
- Launch: radosny, krótki, z jednym konkretem (co nowego i ile to zajmuje).
- Errors: przeprosiny + co się stało + co dalej (zwrot, ponowna próba), bez winy użytkownika.
- Sales (płatna opcja): rzeczowo: co dostajesz, ile kosztuje, kiedy zwracamy; bez presji i fałszywych terminów.
- Social (TikTok / Reels / Shorts): szybko, żartobliwie, pierwszy kadr = problem („nie wiesz, co kupić mamie?”),
  pokazany prawdziwy wynik, nie makieta.

**Terms we own:** „trafiony prezent”, „Prezentoskop”, „sprawdzona cena”, „w minutę”.

**Never use (and why):**
- „gwarantujemy trafiony prezent”: nie jesteśmy w stanie tego zagwarantować.
- „najtańsze oferty”: nie porównujemy cen.
- „bez reklam / bez prowizji”: część linków może być partnerska.
- „AI widzi osobę na zdjęciu”: AI opisuje tylko styl, ubrania i przedmioty.
- „nigdy się nie mylimy”, „100% dopasowania”.

## Proof Points
**Metrics:** brak jeszcze publikowalnych danych (serwis jest przed startem). Nie cytować liczb użytkowników,
konwersji ani „tysięcy prezentów”, dopóki ich nie ma w panelu `/admin`.

**Customers:** brak.

**Testimonials:** brak. Nie zmyślać opinii; zebrać prawdziwe po starcie (z zgodą).

**Value themes:**
| Theme | Proof |
|-------|-------|
| Prawdziwe produkty | każdy link z listy zaufanych domen i otwarty przez AI na stronie produktu (weryfikacja po stronie serwera) |
| Sprawdzona cena | data sprawdzenia widoczna przy produkcie |
| Szybkość | quiz ok. minuty; wynik w ok. 1–2 minuty |
| Prywatność | zdjęcia nie są zapisywane ani wysyłane do analityki |
| Uczciwość | automatyczny zwrot, gdy nie znajdziemy co najmniej 5 sprawdzonych produktów |

## Goals
**Business goal:** zdobyć użytkowników na sezon świąteczny 2026 (Mikołajki i Boże Narodzenie) i zweryfikować, że
darmowy wynik z sieci przekonuje; następnie włączyć płatne „Więcej propozycji” i sieci afiliacyjne ⚠ (cele liczbowe
do ustalenia).

**Conversion action:** ukończenie quizu i kliknięcie „Zobacz w sklepie”; w drugiej kolejności zakup „Więcej
propozycji”. Dodatkowo zapis na przypomnienia o okazjach (double opt-in).

**Current metrics:** brak (serwis przed startem). Dane po starcie: panel `/admin` (quizy, wyniki, kliknięcia, źródła
ruchu `utm_source` / `ref`, koszt AI, trafienia z pamięci wyników).

**Kanały:** TikTok, Instagram Reels, YouTube Shorts (krótkie wideo z prawdziwym wynikiem) oraz poradniki SEO
(np. „prezent dla mamy do 100 zł”). Linki z filmów: `/?utm_source=tiktok_film12`.

## Paid Ads (optional)
Nie dotyczy teraz: brak płatnych reklam. Wypełnić, jeśli kampanie ruszą.

## Learnings
*Decisions and tested lessons. Newest first. Keep it to about 20 active entries.*
| Date | Learning | Evidence | Applies to | Status |
|------|----------|----------|------------|--------|
| 2026-11-21 | Nie obiecujemy „gwarancji trafienia”, „najtańszych ofert” ani „bez prowizji”; ceny i parametry pakietu podajemy tylko takie, jak w kodzie (po zmianie oferty: 10 wyszukiwań za 14,99 zł) | decyzja właściciela: ton bez obietnic, których nie realizujemy | wszystkie kanały, skille copywritingu i SEO | active |
| 2026-11-21 | Teksty strony głównej i metadane mówią jeszcze „6 pytań”, a quiz ma teraz 7 pytań (z opisem osoby) + zdjęcie | `app/page.tsx`, `app/layout.tsx` | strona główna, SEO, social | active |

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-11-21) — Pakiet zmieniony w kodzie na 10 wyszukiwań za 14,99 zł (wcześniej 8 za 12,99/19,99 zł); usunięto ostrzeżenie o rozbieżności i zakaz podawania ceny pakietu.
- v1 (2026-11-21) — Initial context: produkt, odbiorcy, konkurencja, ton i przewaga zebrane z opisu właściciela i z kodu; oznaczone braki (opinie, metryki, oferta pakietu, płatności wyłączone).

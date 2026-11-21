/**
 * Gift guides (/poradniki/...). The text is written by hand and is the same for everybody; the products are
 * found once by the web search (npm run guides:refresh, prompt C) and stored in guide_products.
 * Rules for the copy: no invented facts or statistics, no promises we cannot keep, no product names
 * (the product list changes weekly), warm tone with a bit of humor.
 * Shared with Node scripts: relative imports with `.ts` extensions only.
 */
import type { QuizAnswers } from "../quiz/schema.ts";
import type { AllowedTag } from "../tags.ts";

export type GuideSection = { heading: string; paragraphs: string[] };

/** What the web search is told about the person this guide is for (same shape as a quiz result). */
export type GuideSearchBrief = {
  answers: QuizAnswers;
  styleProfile: string;
  tags: AllowedTag[];
  avoid: AllowedTag[];
};

export type Guide = {
  /** URL segment: /poradniki/<slug>. */
  slug: string;
  /** <title> without the site name (it is added in the page metadata). */
  title: string;
  metaDescription: string;
  h1: string;
  /** One sentence for the cards on /poradniki. */
  teaser: string;
  lead: string[];
  sections: GuideSection[];
  closing: string;
  /** Exactly three other guides to link to. */
  related: [string, string, string];
  search: GuideSearchBrief;
};

export const GUIDES_PUBLISHED = "2026-11-22";
/** Number of products shown (and searched for) per guide. */
export const GUIDE_PRODUCTS_TARGET = 8;
export const GUIDE_PRODUCTS_MIN = 6;

export const GUIDES: Guide[] = [
  {
    slug: "prezent-dla-taty-do-100-zl",
    title: "Prezent dla taty do 100 zł: pomysły, które się przydadzą",
    metaDescription:
      "Szukasz prezentu dla taty do 100 zł? Podpowiadamy, jak wybrać coś, co ucieszy, i pokazujemy sprawdzone produkty z polskich sklepów wraz z ceną.",
    h1: "Prezent dla taty do 100 zł",
    teaser: "Praktycznie, z sercem i bez wchodzenia w tysiące: jak trafić w gust taty, który „niczego nie potrzebuje”.",
    lead: [
      "Tata mówi, że nic mu nie trzeba. To jedno z najbardziej podstępnych zdań w historii prezentów, bo zwykle znaczy „nie chcę, żebyś wydawał pieniądze”, a nie „nie mam żadnych upodobań”. Dobra wiadomość jest taka, że przy budżecie do 100 zł naprawdę da się kupić rzecz, z której tata będzie korzystał, a nie tylko grzecznie podziękuje.",
      "Ten poradnik nie obiecuje cudów. Pokazuje, jak zawęzić poszukiwania i jakie kierunki zwykle działają, a niżej znajdziesz konkretne produkty z polskich sklepów, z ceną sprawdzoną na stronie produktu.",
    ],
    sections: [
      {
        heading: "Zacznij od tego, co tata robi w wolnym czasie",
        paragraphs: [
          "Zanim otworzysz pierwszy sklep, przypomnij sobie ostatnie trzy weekendy taty. Majsterkował przy garażu? Siedział z kawą nad gazetą? Jeździł na rowerze albo oglądał mecz? Prezent najczęściej trafia wtedy, gdy wspiera coś, co tata i tak lubi robić, a nie wymusza nowego nawyku.",
          "Jeśli tata ma hobby, to najprostsza droga: dodatek do tego hobby w rozsądnej cenie. Jeśli nie ma, spójrz na codzienność: co mu ciągle przeszkadza, co się psuje, co zawsze pożycza od innych. Drobiazg, który rozwiązuje drobny problem, bywa lepszy niż wielki prezent „na pokaz”.",
        ],
      },
      {
        heading: "Praktyczne czy z humorem?",
        paragraphs: [
          "Wielu ojców lubi rzeczy użyteczne, ale to nie znaczy, że prezent ma być nudny. Dobrze działa połączenie: coś praktycznego, co ma w sobie odrobinę charakteru, na przykład sprzęt do kuchni lub warsztatu w ładnym wykonaniu albo zestaw, który można od razu rozpakować i użyć.",
          "Jeśli tata ma poczucie humoru, możesz dołożyć do prezentu krótką dedykację na bilecie. Jedno zdanie z przymrużeniem oka często zostaje w pamięci dłużej niż sam przedmiot.",
        ],
      },
      {
        heading: "Na co uważać w budżecie do 100 zł",
        paragraphs: [
          "Przy takiej kwocie łatwo wpaść w pułapkę „gadżetów”, czyli rzeczy, które świetnie wyglądają w sklepie, a potem lądują w szufladzie. Zadaj sobie pytanie: czy tata użyje tego co najmniej kilka razy? Jeśli odpowiedź brzmi „raczej tak”, jesteś na dobrej drodze.",
          "Sprawdź też, czy w cenie nie brakuje czegoś oczywistego, na przykład baterii, akcesorium albo rozmiaru. Ceny i dostępność w poniższych propozycjach sprawdzamy na stronie produktu i podajemy datę, ale wiążąca jest zawsze cena w sklepie w chwili zakupu.",
        ],
      },
      {
        heading: "Prezent, który tata naprawdę zauważy",
        paragraphs: [
          "Wielu ojców nie mówi głośno, co im się podoba, ale zwykle widać to po tym, jak traktują dany przedmiot: czy kładą go na widoku, czy używają bez przerwy, czy opowiadają o nim znajomym. Zapamiętaj taki moment przy okazji kolejnej rodzinnej wizyty. Jeśli tata chętnie pokazuje innym swoje narzędzie, kubek albo książkę, to znak, że lubi dostawać rzeczy z charakterem.",
          "Warto też zapytać mamę lub rodzeństwo. Czasem to oni wiedzą, że tacie od dawna brakuje jednej drobnej rzeczy, której sam sobie nie kupi, bo „szkoda pieniędzy”. Wspólny pomysł rodziny bywa lepszy niż samotne zgadywanie, a jeśli składacie się na prezent, budżet do 100 zł można przekroczyć bez bólu dla jednego portfela.",
          "Na koniec pamiętaj o prostej zasadzie: lepiej kupić rzecz skromniejszą, ale trafną, niż droższą i obcą. Tata zwykle bardziej ceni sam fakt, że ktoś pomyślał o jego sprawach, niż metkę z ceną. Jeśli dodasz do prezentu krótki, szczery dopisek, efekt będzie jeszcze lepszy.",
        ],
      },
    ],
    closing:
      "Jeśli nadal nie wiesz, w którą stronę iść, zrób quiz: odpowiesz na kilka pytań o tacie, a my dobierzemy pięć prezentów dopasowanych właśnie do niego. To zajmuje około minuty.",
    related: ["prezent-dla-mamy-do-100-zl", "prezent-dla-kawosza", "prezenty-do-50-zl"],
    search: {
      answers: {
        recipient: "dad",
        budget: 100,
        occasion: "other",
        interests: ["majsterkowanie", "technologia", "kawa"],
        lifestyle: "homebody",
        giftType: "practical",
        description: "tata, lubi praktyczne rzeczy do domu i garażu, majsterkowanie i dobrą kawę",
      },
      styleProfile: "Tata ceni praktyczne rzeczy, które da się od razu użyć w domu, w garażu albo przy kawie.",
      tags: ["majsterkowanie", "narzędzia", "technologia", "kawa", "gadżety"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-mamy-do-100-zl",
    title: "Prezent dla mamy do 100 zł: pomysły z sercem i bez stresu",
    metaDescription:
      "Prezent dla mamy do 100 zł: jak wybrać coś, co naprawdę ucieszy. Sprawdzone produkty z polskich sklepów, z ceną i krótkim uzasadnieniem.",
    h1: "Prezent dla mamy do 100 zł",
    teaser: "Zamiast kolejnego kubka: jak znaleźć rzecz, która da mamie chwilę oddechu i pokaże, że ją znasz.",
    lead: [
      "Mama zwykle wie, że prezent kupujesz w pośpiechu, i zwykle jest mimo to wzruszona. Ale możesz sprawić jej więcej radości, jeśli pokażesz, że ją znasz. Nie chodzi o kwotę: przy budżecie do 100 zł mieści się dużo rzeczy, które mówią „pomyślałem o Tobie”, a nie „kupiłem pierwsze z brzegu”.",
      "Poniżej znajdziesz kilka sposobów na wybór oraz propozycje konkretnych produktów z polskich sklepów. Zacznij od pytania: czego mama sobie nie kupi, bo uważa, że szkoda pieniędzy?",
    ],
    sections: [
      {
        heading: "Prezent, na który mama sama sobie nie pozwoli",
        paragraphs: [
          "Wiele mam kupuje wszystko dla rodziny, a dla siebie odkłada „na później”. Dobrym tropem jest więc rzecz z kategorii „małe przyjemności”: ładna herbata, krem do rąk, świeca, książka, którą od dawna chciała przeczytać. To nie są rzeczy konieczne, ale właśnie dlatego robią wrażenie.",
          "Jeśli mama lubi rośliny albo gotowanie, szukaj czegoś związanego z tymi zajęciami. Prezent powiązany z jej pasją pokazuje, że zauważasz, co robi dla przyjemności, a nie tylko z obowiązku.",
        ],
      },
      {
        heading: "Ładnie podane, czyli opakowanie i dedykacja",
        paragraphs: [
          "Przy mamie liczą się drobiazgi: kilka słów na bileciku, ręcznie napisanych, potrafi znaczyć więcej niż sama rzecz. Nie musisz być poetą. Wystarczy jedno szczere zdanie o tym, za co jesteś wdzięczny lub wdzięczna.",
          "Jeśli brakuje Ci słów, w płatnej opcji „Więcej propozycji” dostajesz trzy gotowe dedykacje do wyboru, ale nic nie stoi na przeszkodzie, żebyś napisał własną. Własne słowa zwykle wygrywają.",
        ],
      },
      {
        heading: "Rzeczy, których lepiej unikać",
        paragraphs: [
          "Lepiej omijać prezenty, które są zakamuflowaną sugestią, na przykład sprzęt do sprzątania, i takie, które wymagają od mamy dodatkowej pracy. Prezent ma ją odciążyć albo rozpieścić, a nie dodawać obowiązków.",
          "Nie ma też sensu przepłacać za „markę”, jeśli mama jej nie zna. Ceny i dostępność w propozycjach niżej sprawdzamy na stronach sklepów i podajemy datę sprawdzenia, ale zanim klikniesz „kup”, rzuć okiem na cenę jeszcze raz.",
        ],
      },
      {
        heading: "Mała chwila tylko dla niej",
        paragraphs: [
          "Zastanów się, kiedy mama ostatnio miała czas wyłącznie dla siebie. Jeśli odpowiedź brzmi „dawno”, najlepszym prezentem może być przedmiot, który tę chwilę umożliwia: dobra herbata i ładny kubek, nowa książka, miękki koc na wieczór. Taki prezent mówi: odpocznij, należy Ci się.",
          "Warto też dopasować wybór do tego, jak mama spędza dzień. Jeśli dużo gotuje, doceni coś do kuchni, które ułatwia pracę. Jeśli dużo pracuje przy komputerze, przyda się coś wygodnego do biurka lub zestaw do relaksu po pracy. Prezent powinien pasować do jej codzienności, a nie do wyobrażenia o tym, co „kobiety lubią”.",
          "Jeśli budżet na to pozwala, dołóż do prezentu obietnicę: „w sobotę ja zajmuję się obiadem, a Ty odpoczywasz”. Dla wielu mam to jest cenniejsze niż sam przedmiot, bo daje to, czego najbardziej brakuje, czyli czas. Prezent i obietnica razem tworzą komplet, który mama zapamięta na długo.",
        ],
      },
    ],
    closing:
      "Nie masz pewności, czy mama woli praktyczne, czy sentymentalne rzeczy? Zrób quiz w 60 sekund: dopasujemy pięć propozycji do jej zainteresowań i Twojego budżetu.",
    related: ["prezent-dla-taty-do-100-zl", "prezent-dla-osoby-ktora-ma-wszystko", "prezenty-przezycia"],
    search: {
      answers: {
        recipient: "mom",
        budget: 100,
        occasion: "other",
        interests: ["rośliny", "herbata", "książki"],
        lifestyle: "homebody",
        giftType: "thing",
        description: "mama, lubi relaks w domu, ogród, dobre książki i herbatę",
      },
      styleProfile: "Mama ceni spokojne, domowe przyjemności: dobrą herbatę, książki i rośliny.",
      tags: ["rośliny", "herbata", "książki", "relaks", "pielęgnacja"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-dziewczyny-do-200-zl",
    title: "Prezent dla dziewczyny do 200 zł: pomysły, które pokazują, że ją znasz",
    metaDescription:
      "Prezent dla dziewczyny do 200 zł bez zgadywania: wskazówki, jak wybrać, i sprawdzone produkty z polskich sklepów z ceną i krótkim uzasadnieniem.",
    h1: "Prezent dla dziewczyny do 200 zł",
    teaser: "Mniej zgadywania, więcej uważności: jak wybrać prezent, który jest o niej, a nie o Tobie.",
    lead: [
      "Prezent dla dziewczyny to klasyczny test uważności, ale spokojnie: nie trzeba go zdać na szóstkę. Najczęściej wystarczy pokazać, że słuchasz. Jeśli kilka tygodni temu wspomniała, że coś jej się podoba albo że czegoś jej brakuje, masz już pół odpowiedzi.",
      "Budżet do 200 zł daje sporo swobody: starczy na coś osobistego, ładnie wykonanego i mniej oczywistego niż standardowy zestaw kosmetyków. Poniżej kilka zasad wyboru i produkty do przejrzenia.",
    ],
    sections: [
      {
        heading: "Posłuchaj, zanim zaczniesz szukać",
        paragraphs: [
          "Najlepsze pomysły rzadko przychodzą w sklepie. Przychodzą w zwykłych rozmowach: „muszę wreszcie kupić nowy plecak”, „chciałabym znów zacząć czytać”, „ale ładna ta lampka”. Zapisz to w notatce w telefonie jeszcze przed urodzinami, a w grudniu będziesz mieć gotową listę.",
          "Jeśli nic takiego nie przychodzi Ci do głowy, zerknij na to, czym otacza się na co dzień: jakie ma kubki, torby, książki, jak urządza półkę. Styl, który widać w jej rzeczach, podpowie, czy woli minimalizm, kolory czy retro.",
        ],
      },
      {
        heading: "Rzecz, wspólny czas, a może jedno i drugie",
        paragraphs: [
          "Przy takim budżecie warto zastanowić się, czy chcesz dać przedmiot, czy wspólne przeżycie. Czasem najlepszy jest prezent hybrydowy: mała rzecz związana z planem na wspólny wieczór, na przykład książka i bilet na wydarzenie albo zestaw do wspólnego gotowania.",
          "Jeśli się wahasz, zobacz nasz poradnik o prezentach-przeżyciach. Kilka pomysłów z niego da się połączyć z drobnym przedmiotem i wtedy prezent wygląda na starannie przemyślany.",
        ],
      },
      {
        heading: "Biżuteria, kosmetyki, książki: kiedy to ma sens",
        paragraphs: [
          "Biżuteria i kosmetyki bywają bezpiecznym wyborem, ale tylko wtedy, gdy znasz jej gust. Lepiej wybrać coś prostego, co pasuje do wielu stylizacji, niż duży, wyrazisty element, który może się nie spodobać. Przy kosmetykach sprawdź, czy nie ma alergii lub ulubionych marek.",
          "Książka działa, jeśli pamiętasz, co lubi czytać. Jeśli nie, lepiej wybrać prezent z innej kategorii. Ceny i dostępność podajemy z datą sprawdzenia na stronie produktu, ale wiążąca jest zawsze cena w sklepie.",
        ],
      },
      {
        heading: "Gdy nie jesteś pewien jej gustu",
        paragraphs: [
          "Czasem po prostu nie wiesz, jaki ma styl, i to nie jest powód do paniki. Wybierz rzecz neutralną i dobrej jakości, a do niej dodaj coś osobistego: dopisek, wspólne zdjęcie w ramce, drobny element nawiązujący do Waszej historii. Osobisty akcent zwykle przeważa nad idealnym dopasowaniem gustu.",
          "Pomaga też zasada „raczej mniej, ale lepiej”. Jeden dobrze wybrany prezent wygląda starannie, a kilka przypadkowych drobiazgów sprawia wrażenie wypełniacza. Jeśli masz wątpliwości co do rozmiaru, koloru lub wersji, sprawdź warunki wymiany w sklepie jeszcze przed zakupem i dołącz paragon lub potwierdzenie.",
          "Warto też pomyśleć o terminie. Jeśli urodziny lub święta są tuż-tuż, wybierz prezent z szybką dostawą i sprawdź datę doręczenia przed złożeniem zamówienia. Spóźniony prezent, nawet najlepszy, traci część uroku, a nerwy przed wręczeniem rzadko pomagają w dobrym nastroju.",
        ],
      },
    ],
    closing:
      "Nie jesteś pewien, w którą stronę iść? Zrób quiz: odpowiedz na kilka pytań o niej, a dobierzemy pięć prezentów w Twoim budżecie.",
    related: ["prezent-dla-chlopaka-do-200-zl", "prezenty-przezycia", "prezent-dla-osoby-ktora-ma-wszystko"],
    search: {
      answers: {
        recipient: "girlfriend",
        budget: 200,
        occasion: "other",
        interests: ["pielęgnacja", "biżuteria", "świece"],
        lifestyle: "homebody",
        giftType: "thing",
        description: "dziewczyna, lubi ładne drobiazgi, kosmetyki, biżuterię i miłe wieczory w domu",
      },
      styleProfile: "Dziewczyna lubi ładne, osobiste drobiazgi i spokojne wieczory w domu.",
      tags: ["pielęgnacja", "biżuteria", "świece", "relaks", "uroda"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-chlopaka-do-200-zl",
    title: "Prezent dla chłopaka do 200 zł: pomysły bez kolejnych skarpetek",
    metaDescription:
      "Prezent dla chłopaka do 200 zł: jak wybrać rzecz, której będzie używał. Sprawdzone produkty z polskich sklepów z ceną i krótkim uzasadnieniem.",
    h1: "Prezent dla chłopaka do 200 zł",
    teaser: "Bez skarpetek i bez zgadywania: jak znaleźć prezent, który chłopak od razu wypróbuje.",
    lead: [
      "Chłopacy potrafią być wdzięcznymi odbiorcami, ale i trudnymi klientami: „nic mi nie trzeba” oznacza zwykle, że sam sobie kupuje to, co potrzebne, i trudno go zaskoczyć. Tym ciekawsze jest zadanie: znaleźć coś, co go ucieszy i zostanie w użyciu na dłużej.",
      "Przy budżecie do 200 zł możesz pozwolić sobie na rzecz porządniejszą niż „drobiazg na prezent”. Poniżej porady, jak ją znaleźć, a niżej lista produktów do sprawdzenia.",
    ],
    sections: [
      {
        heading: "Zacznij od jego rutyny, nie od sklepu",
        paragraphs: [
          "Zobacz, czego używa codziennie: telefonu, plecaka, butów do biegania, słuchawek, kubka do pracy. Ulepszenie czegoś, czego używa codziennie, zwykle trafia lepiej niż zupełnie nowa kategoria. Jeśli tego nie wiesz, wystarczy chwilę poobserwować.",
          "Zwróć uwagę, co wspomina z entuzjazmem: nowy trening, serial, gra, wyjazd. Prezent związany z jego pasją pokazuje, że go słuchasz, i nie wymaga zgadywania gustu.",
        ],
      },
      {
        heading: "Praktyczne, zabawne albo przyjemnie bezużyteczne",
        paragraphs: [
          "Nie każdy prezent musi być użyteczny. Niektórzy cieszą się z czegoś zabawnego, co po prostu poprawia nastrój: planszówka na wieczór, zestaw do małych eksperymentów w kuchni, coś na biurko. Zastanów się, czy chłopak jest typem praktyka, czy kolekcjonera przyjemnych drobiazgów.",
          "Jeśli masz wątpliwości, wybierz coś, co da się łatwo wymienić lub co działa w kilku stylach. Dobrze zapakowana rzecz z drobnym, osobistym dopiskiem zawsze robi lepsze wrażenie niż droższy prezent bez pomysłu.",
        ],
      },
      {
        heading: "Czego lepiej unikać",
        paragraphs: [
          "Unikaj ubrań w rozmiarze „na oko” i prezentów, które są ukrytym komentarzem (na przykład „pora zadbać o siebie”). Unikaj też sprzętu, który wymaga dobrania do czegoś, czego nie masz, na przykład akcesoriów do konsoli, której nie znasz.",
          "Ceny i dostępność w propozycjach poniżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia. Wiążąca jest jednak cena w sklepie, więc przed zakupem rzuć okiem na aktualną kwotę.",
        ],
      },
      {
        heading: "Prezent, który da się używać wspólnie",
        paragraphs: [
          "Jeśli nie wiesz, co wybrać, pomyśl o prezencie, z którego możecie korzystać razem: gra na wspólny wieczór, zestaw do przygotowania czegoś w kuchni, akcesorium na wyjazd. Taki prezent łączy rzecz z czasem spędzonym razem i rzadko okazuje się nietrafiony, bo jego wartość leży także w samej okazji.",
          "Dobrze działa także prezent związany z wydarzeniem, które planowaliście. Jeśli wspominał o wyjeździe, meczu lub projekcie, dołóż drobiazg, który to ułatwi. Wtedy prezent jest czytelnym sygnałem: słucham Cię i chcę, żeby Ci się udało. To często ważniejsze niż sam przedmiot i jego cena.",
          "Pamiętaj, że prezent nie musi być wielki, żeby był ważny. Dobrze wybrana drobna rzecz, wręczona w odpowiednim momencie i z uśmiechem, potrafi zrobić większe wrażenie niż drogi sprzęt wręczony w pośpiechu. Liczy się to, że widać było, iż o nim myślałeś, a nie tylko wypełniałeś obowiązek.",
        ],
      },
    ],
    closing:
      "Chcesz mieć pewność, że prezent pasuje do jego stylu? Zrób quiz w 60 sekund, a dobierzemy pięć propozycji dla Twojego chłopaka i Twojego budżetu.",
    related: ["prezent-dla-dziewczyny-do-200-zl", "prezent-dla-gracza", "prezent-dla-taty-do-100-zl"],
    search: {
      answers: {
        recipient: "boyfriend",
        budget: 200,
        occasion: "other",
        interests: ["technologia", "gadżety", "sport"],
        lifestyle: "athlete",
        giftType: "practical",
        description: "chłopak, lubi gadżety, sport i praktyczne rzeczy, których używa na co dzień",
      },
      styleProfile: "Chłopak lubi praktyczne gadżety i sport; docenia rzeczy, których używa na co dzień.",
      tags: ["technologia", "gadżety", "sport", "fitness", "muzyka"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-gracza",
    title: "Prezent dla gracza: pomysły dla fanów gier wideo i planszowych",
    metaDescription:
      "Prezent dla gracza, który ma już wszystkie gry? Jak wybierać dodatki, planszówki i akcesoria, plus sprawdzone produkty z polskich sklepów.",
    h1: "Prezent dla gracza",
    teaser: "Gry wideo, planszówki i dodatki do grania: jak kupić prezent, który nie okaże się duplikatem.",
    lead: [
      "Gracze wydają się łatwi do obdarowania: wystarczy kupić grę. W praktyce to jedna z trudniejszych grup, bo wielu z nich ma już swoje tytuły, swoją platformę i swoje zdanie na temat każdej premiery. Kupienie złej gry na złą konsolę to prezent, który wraca do sklepu.",
      "Dobra wiadomość: gracze cieszą się też z rzeczy wokół grania, a tych jest dużo. Poniżej wskazówki, jak się w tym odnaleźć, i propozycje do przejrzenia.",
    ],
    sections: [
      {
        heading: "Zanim kupisz grę, sprawdź trzy rzeczy",
        paragraphs: [
          "Po pierwsze: na czym gra osoba, dla której kupujesz. Komputer, konsola, telefon i każda z konsol mają inne wersje gier, i pomyłka jest łatwa. Po drugie: czy już ją ma. Zapytaj ukradkiem albo zajrzyj do jej listy życzeń, jeśli ją prowadzi. Po trzecie: czy to gra, którą będzie chciała zagrać, czy tylko Ty jej ją polecasz.",
          "Jeśli nie masz pewności, bezpieczniejszą opcją bywa karta podarunkowa lub dodatek, którego nie trzeba dobierać do konkretnej platformy.",
        ],
      },
      {
        heading: "Akcesoria i rzeczy wokół grania",
        paragraphs: [
          "Wiele osób marzy o dodatkach, których nie kupią sobie same: wygodne słuchawki, dobra podkładka, oświetlenie biurka, przyjemny fotel lub poduszka na długie sesje. Takie rzeczy poprawiają codzienne granie i nie wymagają znajomości aktualnych premier.",
          "Warto zwrócić uwagę na komfort: kto gra wiele godzin, ten zauważy różnicę w jakości sprzętu, nawet jeśli tego głośno nie powie.",
        ],
      },
      {
        heading: "Planszówki, czyli granie bez ekranu",
        paragraphs: [
          "Wielu graczy lubi też gry planszowe i karciane, bo można w nie zagrać ze znajomymi przy jednym stole. To wygodny prezent, jeśli nie wiesz, w co gra na komputerze: nie musisz znać platformy, a zasady zwykle są opisane na pudełku.",
          "Sprawdź liczbę graczy, czas rozgrywki i poziom trudności, żeby prezent pasował do tego, z kim zwykle gra obdarowywana osoba. Ceny i dostępność w propozycjach poniżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia.",
        ],
      },
      {
        heading: "Prezent dla gracza, o którym niewiele wiesz",
        paragraphs: [
          "Zdarza się, że kupujesz prezent dla kogoś, o czyich grach wiesz tylko tyle, że „gra w coś na komputerze”. W takiej sytuacji najlepiej wybrać rzecz uniwersalną: dodatek do biurka, wygodny element komfortu, planszówkę lub kartę podarunkową do sklepu z grami. Nie ryzykujesz wtedy zakupu tytułu, który już ma.",
          "Możesz też po prostu zapytać. Niewinne pytanie „w co ostatnio grasz?” zwykle uruchamia wielominutową opowieść, a z niej dowiesz się wszystkiego, co potrzebne. Zapisz nazwy gier i platform, zanim otworzysz sklep. To oszczędza czas i pozwala uniknąć zwrotów, a obdarowany czuje, że ktoś naprawdę słuchał.",
          "Jeśli kupujesz prezent dla młodszego brata, siostrzeńca lub dziecka znajomych, zwróć uwagę na oznaczenia wiekowe gier i zasady rodziców. To prosta rzecz, ale łatwo o niej zapomnieć w pośpiechu. W razie wątpliwości lepiej wybrać planszówkę lub dodatek niezwiązany z konkretnym tytułem.",
        ],
      },
    ],
    closing:
      "Nie wiesz, czy wybrać grę, dodatek czy planszówkę? Zrób quiz w 60 sekund: dobierzemy pięć prezentów dopasowanych do gracza, którego znasz.",
    related: ["prezent-dla-chlopaka-do-200-zl", "prezenty-do-50-zl", "prezent-na-ostatnia-chwile"],
    search: {
      answers: {
        recipient: "friend",
        budget: 200,
        occasion: "other",
        interests: ["gry", "planszówki", "technologia"],
        lifestyle: "gamer",
        giftType: "thing",
        description: "gracz: gry wideo i planszowe, dodatki do grania, wieczory z kontrolerem",
      },
      styleProfile: "Gracz, który lubi gry wideo i planszowe oraz wygodne dodatki do grania.",
      tags: ["gry", "planszówki", "technologia", "gadżety", "puzzle"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-kawosza",
    title: "Prezent dla kawosza: pomysły dla fana dobrej kawy",
    metaDescription:
      "Prezent dla kawosza do 100 zł: akcesoria, ziarna i zestawy dla osoby, która codziennie pije kawę. Sprawdzone produkty z polskich sklepów.",
    h1: "Prezent dla kawosza",
    teaser: "Ziarna, akcesoria i małe rytuały: co sprawia radość komuś, kto zaczyna dzień od kawy.",
    lead: [
      "Kawosz to osoba, która nie powie „dzień dobry” przed pierwszym łykiem. Dla niej kawa to nie napój, tylko poranny rytuał, i dlatego prezent związany z nią zwykle się udaje. Warunek jest jeden: trzeba wiedzieć, jak ta osoba ją pije.",
      "Poniżej znajdziesz kilka tropów, jak wybierać prezent dla kawosza, oraz konkretne produkty z polskich sklepów. Budżet do 100 zł daje sporo możliwości, jeśli wiesz, w którą stronę iść.",
    ],
    sections: [
      {
        heading: "Najpierw sprawdź, jak pije kawę",
        paragraphs: [
          "Z ekspresu, z kawiarki, z zaparzacza, rozpuszczalną, z mlekiem, czarną? To pytanie decyduje o całym prezencie. Sprzęt do jednej metody parzenia nie przyda się osobie, która używa innej, a ziarna do ekspresu nie nadają się do każdego młynka.",
          "Jeśli nie wiesz, przyjrzyj się jej szafce przy okazji wizyty albo zapytaj kogoś bliskiego. Bezpieczne są prezenty, które działają niezależnie od metody: ładny kubek, szklanka termiczna czy zestaw do degustacji różnych ziaren.",
        ],
      },
      {
        heading: "Akcesoria, które robią różnicę",
        paragraphs: [
          "Miłośnicy kawy często doceniają drobiazgi: młynek, waga, dzbanek z długą szyjką, pojemnik na ziarna, ciekawy zestaw do spienienia mleka. Takie rzeczy nie są drogie, a poprawiają jakość codziennych rytuałów. Nie wymagają też od Ciebie wiedzy eksperckiej.",
          "Jeśli chcesz dać ziarna, wybierz małe opakowania kilku odmian, żeby osoba mogła spróbować i sama zdecydować, co jej smakuje. To mniej ryzykowne niż jedno duże opakowanie, które może okazać się nietrafione.",
        ],
      },
      {
        heading: "A jeśli kawosz woli herbatę po południu",
        paragraphs: [
          "Wielu kawoszy po południu przechodzi na herbatę, więc zestaw łączący oba światy, na przykład dwa rodzaje do spróbowania, bywa miłym zaskoczeniem. Zwróć uwagę na ładne opakowanie: kawa i herbata są prezentami, które często wręcza się od ręki.",
          "Ceny i dostępność w propozycjach poniżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia. Wiążąca jest jednak cena w sklepie, a terminy dostawy warto sprawdzić przed zakupem.",
        ],
      },
      {
        heading: "Prezent dla kogoś, kto dopiero wchodzi w świat kawy",
        paragraphs: [
          "Nie każdy kawosz jest ekspertem. Może to ktoś, kto dopiero odkrywa, że kawa może smakować inaczej niż ta z dyspensera. Dla takiej osoby świetnym prezentem jest zestaw startowy: prosty sposób parzenia, mały młynek i kilka rodzajów ziaren do spróbowania. Dzięki temu nie musi od razu inwestować w sprzęt, a Ty nie musisz znać się na kawie.",
          "Jeśli kawosz jest bardziej zaawansowany, nie próbuj go zaskakiwać sprzętem, który wymaga znajomości jego konfiguracji. Lepiej wybrać coś, co wspiera rytuał, na przykład ładny dzbanek, szklankę lub dodatek do przechowywania ziaren. Zawsze możesz też zapytać o jego ulubioną palarnię i kupić coś od niej w małym opakowaniu.",
          "Dobrym dodatkiem do każdego prezentu związanego z kawą jest krótka karteczka z opisem: skąd pochodzą ziarna, jak je parzyć, na co zwrócić uwagę w smaku. Nie musisz znać się na tym perfekcyjnie. Wystarczy przepisać informacje z opakowania, a obdarowana osoba dostanie od razu wskazówkę, od czego zacząć.",
        ],
      },
    ],
    closing:
      "Nie masz pewności, jaki prezent trafi do Twojego kawosza? Zrób quiz w 60 sekund, a dobierzemy pięć propozycji do jego gustu i Twojego budżetu.",
    related: ["prezent-dla-taty-do-100-zl", "prezenty-do-50-zl", "prezent-na-ostatnia-chwile"],
    search: {
      answers: {
        recipient: "friend",
        budget: 100,
        occasion: "other",
        interests: ["kawa", "gotowanie", "dom"],
        lifestyle: "homebody",
        giftType: "thing",
        description: "kawosz: pije kawę codziennie, lubi parzyć po swojemu i próbować nowych ziaren",
      },
      styleProfile: "Kawosz, dla którego poranna kawa to rytuał; lubi akcesoria i próbowanie nowych ziaren.",
      tags: ["kawa", "herbata", "gotowanie", "dom", "słodycze"],
      avoid: [],
    },
  },
  {
    slug: "prezent-dla-osoby-ktora-ma-wszystko",
    title: "Prezent dla osoby, która ma wszystko: pomysły, które zaskakują",
    metaDescription:
      "Co kupić osobie, która ma wszystko? Pomysły na prezenty, które się zużywają, cieszą i nie zagracają półki, plus sprawdzone produkty z polskich sklepów.",
    h1: "Prezent dla osoby, która ma wszystko",
    teaser: "Zamiast kolejnej rzeczy na półkę: pomysły dla kogoś, kto ma już wszystko, i tego, czego jeszcze nie ma.",
    lead: [
      "Każdy zna kogoś takiego: kupuje sobie to, czego potrzebuje, w domu ma porządek i nie ma ochoty na kolejne „rzeczy”. Prezent dla takiej osoby bywa wyzwaniem, ale też okazją, żeby pomyśleć inaczej: nie „co dołożyć”, tylko „co ją ucieszy”.",
      "Zamiast przeglądać półki w nieskończoność, spróbuj spojrzeć na prezent z innej strony. Poniżej kilka kierunków, które często działają, i produkty do sprawdzenia.",
    ],
    sections: [
      {
        heading: "Rzeczy, które się zużywają",
        paragraphs: [
          "Osoba, która ma wszystko, rzadko potrzebuje kolejnego przedmiotu, ale chętnie przyjmie coś, co można zużyć i cieszyć się chwilą: dobra czekolada, herbata, świeca, ziarna kawy, wyjątkowe przyprawy, kosmetyk do kąpieli. Nie zajmują miejsca, a dają przyjemność.",
          "Wybierz jakość zamiast ilości. Jeden starannie wybrany zestaw robi lepsze wrażenie niż wielki kosz z przypadkowymi rzeczami.",
        ],
      },
      {
        heading: "Czas i doświadczenia zamiast przedmiotów",
        paragraphs: [
          "Jeśli ktoś ma wszystko, często brakuje mu czasu i okazji, żeby coś przeżyć. Bilety na wydarzenie, voucher na warsztaty lub wspólny wyjazd są prezentami, które nie wymagają miejsca w szafie. Zajrzyj do naszego poradnika o prezentach-przeżyciach, jeśli ten kierunek Cię interesuje.",
          "Pamiętaj, żeby przeżycie było dopasowane: ktoś, kto nie lubi tłumów, nie będzie zachwycony koncertem na stadionie. Zastanów się, co osoba lubi robić, gdy ma wolny dzień.",
        ],
      },
      {
        heading: "Coś osobistego i trochę nietypowego",
        paragraphs: [
          "Rzeczy osobiste, jak ładny zeszyt z dedykacją, dobrze zapakowany zestaw wspomnień albo prezent związany z wspólną historią, nie mają ceny, a wiele znaczą. Można je połączyć z małym przedmiotem, żeby całość wyglądała na przemyślaną.",
          "Ceny i dostępność w propozycjach niżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia, ale wiążąca jest cena w sklepie. Jeśli kupujesz coś nietypowego, sprawdź warunki zwrotu.",
        ],
      },
      {
        heading: "Gdy trudno ją zaskoczyć, zaskocz ją uwagą",
        paragraphs: [
          "Osoba, która ma wszystko, często uwielbia prezenty pokazujące, że ktoś ją naprawdę zna. Przypomnij sobie zdanie, które kiedyś powiedziała mimochodem, albo rzecz, którą podziwiała u kogoś innego. Takie prezenty rzadko trafiają na listy i właśnie dlatego robią wrażenie.",
          "Dobrze działają także rzeczy, które ułatwiają życie w drobny sposób: przyjemniejsze wersje przedmiotów, z których korzysta codziennie, ale których nigdy nie wymieniłaby sama. Chodzi o to, żeby prezent nie dublował niczego, co ma, więc w razie wątpliwości lepiej zapytać kogoś bliskiego niż zgadywać. Dołącz paragon prezentowy na wypadek pomyłki.",
          "Nie bój się też prezentów drobnych. Osoba, która ma wszystko, często docenia małą, ale dobrze wybraną rzecz bardziej niż drogi, ale obojętny przedmiot. Jeśli chcesz podkreślić wagę okazji, dopisz kilka słów od siebie albo opowiedz przy wręczaniu, dlaczego wybrałeś akurat to.",
        ],
      },
    ],
    closing:
      "Jeśli nadal nie masz pomysłu, zrób quiz w 60 sekund: opisz tę osobę kilkoma słowami, a dobierzemy pięć propozycji, które mogą ją zaskoczyć.",
    related: ["prezenty-przezycia", "prezent-dla-mamy-do-100-zl", "prezent-dla-dziewczyny-do-200-zl"],
    search: {
      answers: {
        recipient: "friend",
        budget: 200,
        occasion: "other",
        interests: ["minimalizm", "premium", "dekoracje"],
        lifestyle: "homebody",
        giftType: "thing",
        description:
          "osoba, która ma już wszystko; szukamy rzeczy nietypowych i przyjemnych, które się zużywają albo po prostu cieszą",
      },
      styleProfile: "Osoba ceni jakość i spokój; woli rzeczy, które się zużywają i cieszą, niż kolejne przedmioty na półce.",
      tags: ["minimalizm", "premium", "dekoracje", "świece", "słodycze"],
      avoid: [],
    },
  },
  {
    slug: "prezent-na-ostatnia-chwile",
    title: "Prezent na ostatnią chwilę: pomysły, które da się szybko kupić",
    metaDescription:
      "Prezent na ostatnią chwilę: jak szybko kupić coś miłego, w wersji elektronicznej lub z krótką dostawą. Sprawdzone produkty z polskich sklepów.",
    h1: "Prezent na ostatnią chwilę",
    teaser: "Jutro urodziny, a Ty nic nie masz? Spokojnie: jak wybrać prezent szybko i bez wstydu.",
    lead: [
      "Zdarza się najlepszym. Za chwilę impreza, za godzinę kolacja, a w głowie pustka. Prezent na ostatnią chwilę nie musi być prezentem na odczepnego. Z odrobiną planu da się znaleźć coś miłego, nawet jeśli czasu jest mało.",
      "Ten poradnik pokazuje, jak podejść do wyboru w pośpiechu, i podpowiada kierunki, które zwykle działają. Poniżej znajdziesz też produkty z polskich sklepów, ale przy zakupie w pośpiechu zawsze sprawdź termin dostawy na stronie sklepu: tego za Ciebie nie obiecamy.",
    ],
    sections: [
      {
        heading: "Najpierw sprawdź, ile masz czasu",
        paragraphs: [
          "To ważniejsze niż pomysł. Jeśli masz kilka godzin, wchodzą w grę rzeczy, które można kupić od ręki, na przykład w sklepie stacjonarnym lub w wersji elektronicznej. Jeśli masz dzień lub dwa, otwiera się więcej możliwości, ale i tak warto wybrać sklep, który jasno podaje termin dostawy.",
          "Zanim złożysz zamówienie, sprawdź datę dostawy, opcję odbioru osobistego i koszt przesyłki. Szybki prezent, który przyjdzie spóźniony, jest gorszy niż prosty, który jest na czas.",
        ],
      },
      {
        heading: "Kierunki, które zwykle się sprawdzają",
        paragraphs: [
          "Wersje elektroniczne, jak karty podarunkowe lub bilety, dochodzą w kilka minut i można je wydrukować lub wysłać wiadomością. Rzeczy do jedzenia i picia, na przykład dobra kawa, herbata czy słodycze, są uniwersalne i trudno je kupić zupełnie nietrafnie.",
          "Książka lub gra planszowa to kolejny bezpieczny wybór, jeśli znasz choć trochę gust osoby. Dopisz kilka słów na bileciku: dedykacja potrafi uratować prezent.",
        ],
      },
      {
        heading: "Jak sprawić, żeby wyglądało na przemyślane",
        paragraphs: [
          "Kluczem jest opakowanie i dopisek. Ładny papier, wstążka i jedno zdanie o tym, dlaczego akurat ten prezent, zmieniają wrażenie. Zamiast „nie miałem czasu” pomyśl „wybrałem coś, co lubisz”.",
          "Jeśli to możliwe, połącz prezent z obietnicą wspólnego czasu: „a w sobotę idziemy na kawę”. Ceny i dostępność w propozycjach niżej sprawdzamy na stronie produktu i podajemy datę, ale wiążąca jest cena w sklepie.",
        ],
      },
      {
        heading: "Czego nie robić, gdy brakuje czasu",
        paragraphs: [
          "Pośpiech sprzyja błędom, więc zanim klikniesz „kup”, sprawdź trzy rzeczy: czy produkt jest dostępny od ręki, czy termin dostawy mieści się w Twoim terminie i czy koszt przesyłki nie jest wyższy niż sam prezent. To nudne, ale oszczędza nerwów. Przy zamówieniach z Polski dostawa bywa szybka, ale nie jest gwarantowana: zawsze patrz na informację przy koszyku.",
          "Unikaj też zakupu rzeczy, które trzeba dopasować, na przykład ubrań, biżuterii z rozmiarem czy sprzętu do konkretnego modelu. W pośpiechu łatwo pomylić rozmiar lub wersję. Lepiej wybierz coś, co sprawdzi się u każdego, i dodaj do tego kilka ciepłych słów. Prezent kupiony w pięć minut potrafi być miły, jeśli ma dobry dopisek.",
          "A jeśli mimo wszystko prezent dotrze po terminie, nie ukrywaj tego. Powiedz otwarcie, że chciałeś dobrze wybrać i dlatego trochę to trwało, i dodaj małą zapowiedź: „Twój prezent jest w drodze”. Szczerość i uśmiech załatwiają więcej niż udawanie, że wszystko poszło idealnie.",
        ],
      },
    ],
    closing:
      "Quiz zajmuje około minuty i podpowie pięć konkretnych prezentów: to może być najszybszy sposób, żeby wyjść z kłopotu. Zrób go, zanim zamkną sklepy.",
    related: ["prezenty-do-50-zl", "prezent-dla-kawosza", "prezenty-przezycia"],
    search: {
      answers: {
        recipient: "friend",
        budget: 100,
        occasion: "other",
        interests: ["słodycze", "książki", "kawa"],
        lifestyle: "homebody",
        giftType: "thing",
        description:
          "prezent na ostatnią chwilę: wersja elektroniczna lub rzecz łatwa do szybkiego kupienia, uniwersalna",
      },
      styleProfile: "Uniwersalny, miły prezent, który da się szybko kupić; najlepiej w wersji elektronicznej albo z krótką dostawą.",
      tags: ["słodycze", "książki", "kawa", "herbata", "planszówki"],
      avoid: [],
    },
  },
  {
    slug: "prezenty-do-50-zl",
    title: "Prezenty do 50 zł: małe pomysły, które cieszą",
    metaDescription:
      "Prezenty do 50 zł, które nie wyglądają na tanie: jak wybrać drobiazg z sensem. Sprawdzone produkty z polskich sklepów z ceną i uzasadnieniem.",
    h1: "Prezenty do 50 zł",
    teaser: "Mały budżet, duże wrażenie: jak wybrać drobiazg, który nie wygląda na kupiony w pośpiechu.",
    lead: [
      "Pięćdziesiąt złotych to kwota, przy której łatwo wpaść w pułapkę: albo kupić coś „bo się mieści”, albo przestać szukać. Tymczasem przy takim budżecie da się wybrać prezent, który cieszy, jeśli zamiast ceny wybierzesz pomysł.",
      "Poniżej kilka sposobów na wybór drobnych prezentów, na przykład dla znajomych w pracy, dla rodziny przy świątecznym stole albo jako dodatek do większego upominku.",
    ],
    sections: [
      {
        heading: "Małe, ale dopasowane",
        paragraphs: [
          "Mały prezent powinien mieć jedno zadanie: pokazać, że znasz tę osobę. Wystarczy jedno trafne skojarzenie: ulubiona herbata, zabawny kubek, notes dla kogoś, kto wszystko zapisuje, drobiazg dla fana planszówek. Lepiej wybrać coś małego i osobistego niż większe, ale przypadkowe.",
          "Zanim zaczniesz szukać, zapisz trzy rzeczy, które lubi ta osoba. Przy tak małym budżecie to wystarczy, żeby zawęzić poszukiwania do kilku kategorii.",
        ],
      },
      {
        heading: "Rzeczy, które zawsze się przydają",
        paragraphs: [
          "Dobrą stroną drobnych prezentów jest to, że wiele z nich się zużywa: słodycze, herbata, świeca, kosmetyk, ziarna kawy. Nie zagracają domu, a każdy znajdzie dla nich zastosowanie. To bezpieczny kierunek, jeśli nie znasz dobrze obdarowywanej osoby.",
          "Książka lub gra kieszonkowa też mieszczą się w takim budżecie. Zwróć uwagę na koszt dostawy, który przy niskiej cenie produktu może znacząco wpłynąć na końcowy rachunek.",
        ],
      },
      {
        heading: "Jak podnieść wartość bez podnoszenia ceny",
        paragraphs: [
          "Opakowanie i dedykacja mają ogromne znaczenie. Zwykły drobiazg w ładnym papierze z krótkim, szczerym dopiskiem wygląda jak prezent, na którym Ci zależało. Możesz też połączyć dwa mniejsze prezenty w jeden zestaw, na przykład herbatę i miły kubek.",
          "Ceny i dostępność w propozycjach niżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia, ale wiążąca jest cena w sklepie. Przy małej kwocie uważaj na koszty wysyłki.",
        ],
      },
      {
        heading: "Prezenty dla wielu osób naraz",
        paragraphs: [
          "Przy większej liczbie obdarowanych, na przykład w biurze, w klasie lub w rodzinie, budżet do 50 zł na osobę jest bardzo realny. Dobrze sprawdza się wtedy jedna kategoria prezentów w kilku wariantach: kilka smaków herbaty, kilka rodzajów słodyczy, kilka książek w różnych gatunkach. Dzięki temu prezenty wyglądają spójnie, a każdy dostaje coś trochę innego.",
          "Zapisz listę osób w notatniku i obok każdej jedno słowo opisujące jej gust. To zajmuje kilka minut, a oszczędza godziny błądzenia po sklepach. Przy większych zamówieniach sprawdź też, czy sklep nie oferuje darmowej dostawy powyżej określonej kwoty: kilka małych prezentów w jednym koszyku bywa tańszych w transporcie.",
          "Warto zachować spokój przy ocenie wartości prezentu. Przy większej liczbie osób ważne jest, żeby nikt nie poczuł się pominięty, a nie żeby każdy dostał dokładnie to samo. Jeśli ktoś ma wyjątkowe zainteresowania, możesz zamienić jeden prezent z zestawu na coś bardziej dopasowanego, trzymając się tej samej kwoty.",
        ],
      },
    ],
    closing:
      "Chcesz dopasować mały prezent do konkretnej osoby? Zrób quiz w 60 sekund i wybierz budżet do 50 zł: dobierzemy pięć propozycji.",
    related: ["prezent-na-ostatnia-chwile", "prezent-dla-kawosza", "prezent-dla-gracza"],
    search: {
      answers: {
        recipient: "friend",
        budget: 50,
        occasion: "other",
        interests: ["słodycze", "herbata", "humor"],
        lifestyle: "homebody",
        giftType: "funny",
        description: "mały, miły prezent do 50 zł, z humorem albo do zużycia, który nie wygląda na tani",
      },
      styleProfile: "Mały, miły prezent; najlepiej coś do zużycia albo z odrobiną humoru.",
      tags: ["słodycze", "herbata", "humor", "kawa", "świece"],
      avoid: [],
    },
  },
  {
    slug: "prezenty-przezycia",
    title: "Prezenty-przeżycia: pomysły na prezent zamiast rzeczy",
    metaDescription:
      "Prezenty-przeżycia: bilety, vouchery i karty podarunkowe zamiast kolejnej rzeczy. Jak wybrać prezent-doświadczenie i na co uważać, plus sprawdzone propozycje.",
    h1: "Prezenty-przeżycia",
    teaser: "Bilety, vouchery i karty podarunkowe: jak podarować czas i wspomnienia zamiast kolejnej rzeczy.",
    lead: [
      "Są osoby, którym nic nie brakuje, i są prezenty, które po miesiącu leżą w szufladzie. Prezent-przeżycie to odpowiedź na oba problemy: zamiast przedmiotu dajesz wydarzenie, które można zapamiętać. Może to być koncert, warsztat, kolacja, a nawet karta podarunkowa do ulubionego sklepu.",
      "Ten poradnik wyjaśnia, jak wybierać prezenty-przeżycia, żeby nie były „kupione na odczepnego”, i na co zwrócić uwagę przy voucherach oraz kartach podarunkowych. Niżej znajdziesz propozycje do sprawdzenia.",
    ],
    sections: [
      {
        heading: "Dopasuj przeżycie do osoby, nie do mody",
        paragraphs: [
          "Najważniejsze pytanie brzmi: co ta osoba lubi robić, gdy ma wolny dzień? Spokojna wizyta w spa i dynamiczna aktywność to zupełnie różne prezenty. Ktoś, kto lubi spokój, nie będzie zachwycony głośnym wydarzeniem, a ktoś, kto kocha adrenalinę, może się znudzić na degustacji.",
          "Zwróć uwagę, czy to ma być przeżycie dla jednej osoby, czy dla dwóch. Wspólne wyjście bywa lepszym prezentem, bo oprócz samego wydarzenia dostajecie wspólny czas.",
        ],
      },
      {
        heading: "Vouchery, bilety i karty podarunkowe: na co uważać",
        paragraphs: [
          "Zanim kupisz, sprawdź termin ważności, możliwość zmiany daty i warunki zwrotu. Przy voucherach na przeżycia nierzadko trzeba samodzielnie zarezerwować termin, co oznacza dodatkową pracę dla obdarowanej osoby. Przy prezencie na ostatnią chwilę wybierz wersję elektroniczną, jeśli to możliwe.",
          "Karta podarunkowa jest bezpieczna, ale mniej osobista. Dobrze działa wtedy, gdy znasz sklep, który obdarowana osoba lubi, i dodasz do niej odręczny dopisek lub drobny upominek.",
        ],
      },
      {
        heading: "Jak sprawić, żeby prezent-przeżycie był prezentem, a nie obowiązkiem",
        paragraphs: [
          "Najlepiej wręczyć go razem z krótkim opisem: co to jest, kiedy można skorzystać, czy chcesz iść razem. Dobrze zapakowana koperta z biletem i kilkoma słowami wygląda jak prawdziwy prezent, a nie tylko kod w wiadomości.",
          "Ceny i dostępność w propozycjach niżej sprawdzamy na stronie produktu i podajemy datę sprawdzenia, ale wiążąca jest oferta sklepu w chwili zakupu, w tym regulamin vouchera.",
        ],
      },
      {
        heading: "Prezent-przeżycie dla kogoś, kto mieszka daleko",
        paragraphs: [
          "Jeśli osoba, której kupujesz prezent, mieszka w innym mieście, przeżycie online lub karta podarunkowa mają dużą przewagę nad paczką: nie ma kosztów wysyłki i ryzyka uszkodzenia. Możesz wysłać bilet lub kod w wiadomości, a do tego dopisać kilka ciepłych słów albo nagrać krótkie nagranie głosowe.",
          "Pamiętaj, że przeżycie powinno być dostępne tam, gdzie mieszka obdarowana osoba. Voucher na wydarzenie w drugim końcu Polski będzie dla niej raczej problemem niż prezentem. Zanim kupisz, sprawdź lokalizację, terminy i możliwość wymiany. Jeśli nie masz pewności, karta podarunkowa do sklepu, który lubi, bywa rozsądnym kompromisem.",
          "Jeśli to możliwe, zaplanuj wspólny termin. Prezent-przeżycie nabiera wartości, gdy wiadomo, że nie zostanie w skrzynce mailowej na długo. Zaproponuj konkretny weekend lub wieczór i zapytaj, czy pasuje. Wtedy prezent staje się zaproszeniem, a zaproszenie często cieszy bardziej niż przedmiot.",
        ],
      },
    ],
    closing:
      "Nie wiesz, czy wybrać rzecz, czy przeżycie? Zrób quiz w 60 sekund, a pokażemy pięć propozycji dopasowanych do tej osoby.",
    related: ["prezent-dla-osoby-ktora-ma-wszystko", "prezent-dla-dziewczyny-do-200-zl", "prezent-na-ostatnia-chwile"],
    search: {
      answers: {
        recipient: "friend",
        budget: 200,
        occasion: "other",
        interests: ["podróże", "relaks", "muzyka"],
        lifestyle: "traveler",
        giftType: "experience",
        description: "prezent-przeżycie zamiast rzeczy: bilety, vouchery i karty podarunkowe",
      },
      styleProfile: "Osoba woli wspomnienia od przedmiotów: wyjścia, wydarzenia i wspólny czas.",
      tags: ["podróże", "relaks", "muzyka", "filmy", "spa"],
      avoid: [],
    },
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/** Words in the body text (lead, headings, sections, closing), used to keep every guide within 400-700 words. */
export function guideWordCount(guide: Guide): number {
  const text = [
    ...guide.lead,
    ...guide.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    guide.closing,
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

import demoWebPicks from "@/data/demo-web-picks.json";
import { fallbackResult } from "@/lib/ai/picks";
import { demoDelay, randomInt } from "@/lib/demo/delay";
import { PICKS_COUNT } from "@/lib/picks/candidates";
import type { OCCASION_OPTIONS } from "@/lib/quiz/schema";
import type { AiService, UsageEntry } from "@/lib/services/ai";

const DEMO_MODEL = "demo-model";

const STYLE_SENTENCES = [
  "Wygląda na to, że ta osoba ceni proste przyjemności i dobrze wybrane drobiazgi. Prezent z duszą trafi tu lepiej niż cokolwiek z błyskiem!",
  "Wygląda na to, że to ktoś, kto zawsze ma plan na weekend. Najlepiej taki, w którym przyda się coś praktycznego.",
  "Wygląda na to, że ta osoba lubi otaczać się rzeczami, które mają swoją historię. Kolekcja ulubionych drobiazgów pewnie już na nią czeka.",
  "Wygląda na to, że spokojny wieczór z ulubionym zajęciem to dla tej osoby ideał. Wystarczy dorzucić coś, co ten wieczór umili.",
  "Wygląda na to, że to prawdziwy entuzjasta swoich pasji. Każdy prezent związany z hobby zostanie przyjęty z błyskiem w oku.",
  "Wygląda na to, że ta osoba docenia dobry design i porządek. Rzeczy ładne i przydatne naraz to strzał w dziesiątkę.",
  "Wygląda na to, że ciekawość świata to jej drugie imię. Coś, co pozwoli odkryć nowe smaki albo miejsca, będzie idealne.",
  "Wygląda na to, że to ktoś, kto lubi się zrelaksować po swojemu. Prezent, który pomoże zwolnić tempo, zostanie doceniony.",
  "Wygląda na to, że humor i dystans to jej mocne strony. Prezent z przymrużeniem oka na pewno wywoła uśmiech.",
  "Wygląda na to, że ta osoba ma głowę pełną pomysłów. Przyda się coś, co pomoże je zrealizować albo chociaż zapisać.",
];

const DEDICATIONS: Record<(typeof OCCASION_OPTIONS)[number]["value"], [string, string, string]> = {
  christmas: [
    "Niech te Święta przyniosą Ci spokój, ciepło i dużo czasu na to, co kochasz.",
    "Mikołaj podobno sprawdzał listę dwa razy. Wyszło, że zasłużyłeś/aś na coś wyjątkowego!",
    "Wesołych Świąt i samych dobrych chwil.",
  ],
  st_nicholas: [
    "Mały prezent od serca, żeby grudzień był jeszcze milszy.",
    "Mikołaj nie zdążył, więc przejęłam/przejąłem dostawę. Smacznego rozpakowywania!",
    "Słodkich Mikołajek!",
  ],
  birthday: [
    "Wszystkiego najlepszego! Niech kolejny rok będzie pełen pasji i dobrych ludzi.",
    "Rok starszy, ale prezent wciąż w świetnym stylu. Sto lat!",
    "Najlepsze życzenia urodzinowe.",
  ],
  other: [
    "Mały upominek, żeby przypomnieć, jak ważny/a dla mnie jesteś.",
    "Bez okazji też można. A nawet trzeba!",
    "Z serdecznymi pozdrowieniami.",
  ],
};

function fakeUsage(step: UsageEntry["step"], extra: Partial<UsageEntry> = {}): UsageEntry {
  return { step, model: DEMO_MODEL, inputTokens: randomInt(600, 1600), outputTokens: randomInt(60, 220), ...extra };
}

/** Demo AI: deterministic-looking answers, 1–3 s delay, fake token usage. */
export function createDemoAi(): AiService {
  return {
    async analyzeProfile(answers) {
      await demoDelay();
      const styleProfile = STYLE_SENTENCES[randomInt(0, STYLE_SENTENCES.length - 1)];
      return {
        response: { profile: { styleProfile, tags: [...answers.interests], avoid: [] }, source: "demo" },
        usage: [fakeUsage("profile")],
      };
    },

    async pickProducts(_answers, profile, candidates) {
      await demoDelay();
      return {
        result: fallbackResult(candidates.slice(0, PICKS_COUNT), profile, "demo"),
        usage: [fakeUsage("picks")],
      };
    },

    async webSearch(input) {
      await demoDelay();
      const retrievedAt = new Date().toISOString();
      const picks = demoWebPicks.slice(0, input.count + 9);
      return {
        picks: picks.map((pick) => ({
          name: pick.title,
          price_pln: pick.price_pln,
          shop: pick.shop_name,
          url: pick.url,
          reason: pick.reason,
          category: "inne",
        })),
        fetchedPages: picks.map((pick) => ({ url: pick.url, retrievedAt })),
        summary: null,
        usage: [
          fakeUsage(input.kind === "paid" ? "web_search" : "free_web_search", {
            webSearches: input.kind === "paid" ? 3 : 2,
            webFetches: input.kind === "paid" ? 6 : 4,
            inputTokens: randomInt(5000, 12000),
          }),
        ],
      };
    },

    async writeDedications(answers) {
      await demoDelay();
      return { dedications: [...DEDICATIONS[answers.occasion]], usage: [fakeUsage("dedications")] };
    },
  };
}

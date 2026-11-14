/**
 * Fixed list of gift tags used across the app (catalog, AI prompts, filters).
 * Shared with Node scripts: keep imports relative with explicit `.ts` extensions.
 */

export const ALLOWED_TAGS = [
  // Food & drink
  "kawa",
  "herbata",
  "gotowanie",
  "pieczenie",
  "wino",
  "piwo",
  "słodycze",
  // Entertainment
  "gry",
  "planszówki",
  "puzzle",
  "książki",
  "komiksy",
  "anime",
  "filmy",
  "muzyka",
  // Tech
  "technologia",
  "gadżety",
  "fotografia",
  "smart-home",
  // Sport & outdoor
  "sport",
  "bieganie",
  "rower",
  "fitness",
  "joga",
  "góry",
  "turystyka",
  "kemping",
  "wędkarstwo",
  "podróże",
  // Home & garden
  "dom",
  "dekoracje",
  "minimalizm",
  "ogród",
  "rośliny",
  "majsterkowanie",
  "narzędzia",
  "motoryzacja",
  // Beauty & fashion
  "uroda",
  "pielęgnacja",
  "perfumy",
  "moda",
  "biżuteria",
  "zegarki",
  "torby",
  // Wellbeing
  "relaks",
  "świece",
  "spa",
  // People & pets
  "zwierzęta",
  "psy",
  "koty",
  "dzieci",
  "zabawki",
  // Creativity & work
  "nauka",
  "kreatywność",
  "rysowanie",
  "rękodzieło",
  "biuro",
  "planowanie",
  // Gift character
  "personalizacja",
  "eko",
  "humor",
  "premium",
] as const;

export type AllowedTag = (typeof ALLOWED_TAGS)[number];

const allowedSet: ReadonlySet<string> = new Set(ALLOWED_TAGS);

export function isAllowedTag(value: string): value is AllowedTag {
  return allowedSet.has(value);
}

/** Lowercase and strip Polish diacritics so "Ekspresy do kawy" matches "kawy". */
export function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type TagRule = { keywords: string[]; tags: AllowedTag[] };

/**
 * Category keyword → tags. Keywords are matched as substrings of the normalized
 * category path (e.g. "dom i ogrod > kuchnia > ekspresy do kawy"), so use stems.
 * Order matters: earlier rules win when the tag limit is reached.
 */
export const CATEGORY_TAG_RULES: TagRule[] = [
  { keywords: ["kawa", "kawy", "ekspres", "mlynek do kawy", "kawiar"], tags: ["kawa"] },
  { keywords: ["herbat", "czajnik", "zaparzacz"], tags: ["herbata"] },
  { keywords: ["kuchni", "garnk", "patelni", "noz kuchen", "noze kuchen", "przypraw", "gotowan"], tags: ["gotowanie", "dom"] },
  { keywords: ["piecz", "forma do", "foremk", "cukierni"], tags: ["pieczenie", "gotowanie"] },
  { keywords: ["wino", "wina", "wine", "karafk", "korkociag"], tags: ["wino"] },
  { keywords: ["piwo", "piwa", "browar"], tags: ["piwo"] },
  { keywords: ["slodycz", "czekolad", "cukierk", "praliny"], tags: ["słodycze"] },

  { keywords: ["planszow", "gry towarzysk", "gry karciane", "board game"], tags: ["planszówki", "gry"] },
  { keywords: ["konsol", "gry wideo", "gry komputer", "gaming", "pad ", "playstation", "xbox", "nintendo"], tags: ["gry", "technologia"] },
  { keywords: ["puzzl", "lamiglow"], tags: ["puzzle"] },
  { keywords: ["ksiazk", "ksiazek", "literatur", "powiesc", "poradnik", "e-book", "ebook", "czytnik"], tags: ["książki"] },
  { keywords: ["komiks", "manga"], tags: ["komiksy"] },
  { keywords: ["anime", "manga"], tags: ["anime"] },
  { keywords: ["film", "dvd", "blu-ray", "projektor"], tags: ["filmy"] },
  { keywords: ["muzyk", "winyl", "gramofon", "gitar", "instrument", "glosnik", "sluchawk"], tags: ["muzyka"] },

  { keywords: ["elektronik", "smartfon", "telefon", "komputer", "laptop", "tablet", "akcesoria gsm", "powerbank", "ladowark"], tags: ["technologia"] },
  { keywords: ["gadzet", "smartwatch", "opaska sportowa", "drony", "dron"], tags: ["gadżety", "technologia"] },
  { keywords: ["fotograf", "aparat", "obiektyw", "statyw", "instax"], tags: ["fotografia"] },
  { keywords: ["inteligentny dom", "smart home", "zarowki smart", "asystent glosowy"], tags: ["smart-home", "technologia"] },

  { keywords: ["sport", "pilka", "rakiet", "trening"], tags: ["sport"] },
  { keywords: ["biegan", "biegow"], tags: ["bieganie", "sport"] },
  { keywords: ["rower", "kolarsk"], tags: ["rower", "sport"] },
  { keywords: ["fitness", "silowni", "hantl", "kettlebell", "mata do cwiczen"], tags: ["fitness", "sport"] },
  { keywords: ["joga", "jogi", "yoga", "medytac"], tags: ["joga", "relaks"] },
  { keywords: ["gory", "gorsk", "trekking", "wspinacz", "kijki"], tags: ["góry", "turystyka"] },
  { keywords: ["turyst", "outdoor", "plecak"], tags: ["turystyka"] },
  { keywords: ["kemping", "camping", "namiot", "spiwor", "survival"], tags: ["kemping", "turystyka"] },
  { keywords: ["wedkar", "wedk"], tags: ["wędkarstwo"] },
  { keywords: ["podroz", "walizk", "bagaz"], tags: ["podróże"] },

  { keywords: ["dom i wnetrz", "wyposazenie domu", "artykuly domowe", "pled", "koc"], tags: ["dom"] },
  { keywords: ["dekorac", "ozdob", "obraz", "plakat", "ramk", "wazon"], tags: ["dekoracje", "dom"] },
  { keywords: ["minimal", "skandynaw"], tags: ["minimalizm"] },
  { keywords: ["ogrod", "grill"], tags: ["ogród"] },
  { keywords: ["rosli", "kwiat", "doniczk", "nasion"], tags: ["rośliny"] },
  { keywords: ["majsterk", "diy", "warsztat"], tags: ["majsterkowanie", "narzędzia"] },
  { keywords: ["narzedzi", "elektronarzedz", "wkretark"], tags: ["narzędzia"] },
  { keywords: ["motoryzac", "samochod", "auto ", "akcesoria samochod"], tags: ["motoryzacja"] },

  { keywords: ["uroda", "kosmety", "makijaz"], tags: ["uroda"] },
  { keywords: ["pielegnac", "krem", "balsam", "kapiel"], tags: ["pielęgnacja", "uroda"] },
  { keywords: ["perfum", "zapach", "woda toaletowa"], tags: ["perfumy"] },
  { keywords: ["odziez", "ubran", "moda", "bluz", "koszul", "sweter", "skarpet", "czapk", "szalik"], tags: ["moda"] },
  { keywords: ["bizuter", "naszyjnik", "bransolet", "kolczyk", "pierscion"], tags: ["biżuteria"] },
  { keywords: ["zegark"], tags: ["zegarki"] },
  { keywords: ["torb", "torebk", "portfel", "plecaki miejskie"], tags: ["torby", "moda"] },

  { keywords: ["relaks", "masaz", "aromaterap", "dyfuzor"], tags: ["relaks"] },
  { keywords: ["swiec", "swieczk"], tags: ["świece", "relaks"] },
  { keywords: ["spa", "sauna", "zestaw do kapieli"], tags: ["spa", "relaks"] },

  { keywords: ["zwierz", "zoologi"], tags: ["zwierzęta"] },
  { keywords: ["dla psa", "psy", "psow", "smycz", "obroz"], tags: ["psy", "zwierzęta"] },
  { keywords: ["dla kota", "koty", "koci", "drapak"], tags: ["koty", "zwierzęta"] },
  { keywords: ["dzieci", "dziecie", "niemowl"], tags: ["dzieci"] },
  { keywords: ["zabawk", "klocki", "lego"], tags: ["zabawki", "dzieci"] },

  { keywords: ["edukac", "nauk", "kurs", "jezyk", "eksperyment"], tags: ["nauka"] },
  { keywords: ["kreatyw", "artystycz", "plastycz"], tags: ["kreatywność"] },
  { keywords: ["rysow", "malow", "farby", "pedzl", "kredk", "szkicownik"], tags: ["rysowanie", "kreatywność"] },
  { keywords: ["rekodziel", "szydel", "wloczk", "haft", "szyc"], tags: ["rękodzieło", "kreatywność"] },
  { keywords: ["biur", "artykuly pismien", "piora", "pioro", "dlugopis"], tags: ["biuro"] },
  { keywords: ["planer", "kalendarz", "notes", "notatnik", "organizer"], tags: ["planowanie", "biuro"] },

  { keywords: ["personaliz", "grawer", "z imieniem", "z nadrukiem"], tags: ["personalizacja"] },
  { keywords: ["eko", "ekologi", "bambus", "wielorazow", "zero waste"], tags: ["eko"] },
  { keywords: ["smieszn", "zabawne", "humor", "gadzety imprezowe"], tags: ["humor"] },
  { keywords: ["premium", "luksus", "ekskluzyw"], tags: ["premium"] },
];

export const MAX_TAGS_PER_PRODUCT = 6;

/**
 * Tags for a category path. Only the two most specific segments are used, because
 * top-level groups like "Dom i ogród" are too broad. Falls back to the product name
 * when the category gives nothing.
 */
export function tagsForProduct(category: string | null | undefined, name?: string | null): AllowedTag[] {
  const segments = (category ?? "")
    .split(/\s*(?:>|\/|\||»)\s*/)
    .filter(Boolean);
  const fromCategory = matchTags(segments.slice(-2).join(" > "));
  if (fromCategory.length > 0) return fromCategory;
  return matchTags(name ?? "");
}

function matchTags(text: string): AllowedTag[] {
  const haystack = ` ${normalizeForMatching(text)} `;
  if (haystack.trim().length === 0) return [];

  const result: AllowedTag[] = [];
  for (const rule of CATEGORY_TAG_RULES) {
    if (!rule.keywords.some((keyword) => haystack.includes(normalizeForMatching(keyword)))) continue;
    for (const tag of rule.tags) {
      if (!result.includes(tag)) result.push(tag);
      if (result.length >= MAX_TAGS_PER_PRODUCT) return result;
    }
  }
  return result;
}

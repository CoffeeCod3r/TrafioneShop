/**
 * Category -> illustration (public/illustrations/*.svg). The ONLY place that maps a category to a picture:
 * every product card uses getIllustration(). An unknown or missing category gets the generic gift box.
 * The illustrations carry no text and no brands.
 */
export type Illustration = { src: string; alt: string };

export const ILLUSTRATION_CATEGORIES = [
  "dom",
  "ogrod",
  "kuchnia",
  "jedzenie",
  "ksiazki",
  "gry",
  "elektronika",
  "sport",
  "moda",
  "uroda",
  "hobby",
  "podroze",
] as const;
export type IllustrationCategory = (typeof ILLUSTRATION_CATEGORIES)[number];

const ALT: Record<IllustrationCategory, string> = {
  dom: "dom",
  ogrod: "ogród",
  kuchnia: "kuchnia",
  jedzenie: "jedzenie i napoje",
  ksiazki: "książki",
  gry: "gry",
  elektronika: "elektronika",
  sport: "sport",
  moda: "moda",
  uroda: "uroda",
  hobby: "hobby",
  podroze: "podróże",
};

/** Other category names used by the catalog / older data, folded into the 12 illustrated ones. */
const ALIASES: Record<string, IllustrationCategory> = {
  zywnosc: "jedzenie",
  zabawki: "gry",
  turystyka: "podroze",
};

export const GENERIC_ILLUSTRATION: Illustration = {
  src: "/illustrations/prezent.svg",
  alt: "Ilustracja: pudełko z prezentem",
};

/** Normalizes "Kuchnia > Akcesoria" / "Podróże" / "ogrod" to the first segment without diacritics. */
export function normalizeCategory(category: string | null | undefined): string {
  return (category ?? "")
    .split(">")[0]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l");
}

export function getIllustration(category: string | null | undefined): Illustration {
  const key = normalizeCategory(category);
  const resolved = (ILLUSTRATION_CATEGORIES as readonly string[]).includes(key) ? (key as IllustrationCategory) : ALIASES[key];
  if (!resolved) return GENERIC_ILLUSTRATION;
  return { src: `/illustrations/${resolved}.svg`, alt: `Ilustracja: ${ALT[resolved]}` };
}

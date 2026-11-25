/**
 * Which cells of the pool coverage grid to top up first: below the health threshold, the most asked-for first.
 * Demand = results of the last 7 days with the same recipient and price range whose interests belong to the category.
 * Pure functions.
 */
import type { AllowedTag } from "../tags.ts";
import { belowThreshold, cellKey, priceBucket, type CoverageCell } from "./pool.ts";

export const MAX_CELLS_PER_NIGHT = 10;

/** Quiz interest tag -> pool category (the 12 categories of lib/illustrations.ts). Tags with no clear category are absent. */
const TAG_CATEGORY: Partial<Record<AllowedTag, string>> = {
  kawa: "jedzenie", herbata: "jedzenie", wino: "jedzenie", piwo: "jedzenie", słodycze: "jedzenie",
  gotowanie: "kuchnia", pieczenie: "kuchnia",
  gry: "gry", planszówki: "gry", puzzle: "gry", zabawki: "gry",
  książki: "ksiazki", komiksy: "ksiazki", anime: "ksiazki", filmy: "hobby", muzyka: "hobby",
  technologia: "elektronika", gadżety: "elektronika", fotografia: "elektronika", "smart-home": "elektronika",
  sport: "sport", bieganie: "sport", rower: "sport", fitness: "sport", joga: "sport", góry: "sport",
  turystyka: "podroze", kemping: "podroze", wędkarstwo: "sport", podróże: "podroze",
  dom: "dom", dekoracje: "dom", minimalizm: "dom", świece: "dom", relaks: "dom",
  ogród: "ogrod", rośliny: "ogrod",
  majsterkowanie: "hobby", narzędzia: "hobby", motoryzacja: "hobby",
  uroda: "uroda", pielęgnacja: "uroda", perfumy: "uroda", spa: "uroda",
  moda: "moda", biżuteria: "moda", zegarki: "moda", torby: "moda",
  nauka: "hobby", kreatywność: "hobby", rysowanie: "hobby", rękodzieło: "hobby", biuro: "hobby", planowanie: "hobby",
};

export type Demand = { recipient: string | null; budget_pln: number | null; tags: string[] };

/** Number of recent results asking for each cell (a result counts once per category its interests touch). */
export function demandByCell(demand: readonly Demand[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of demand) {
    if (!item.recipient || item.budget_pln === null) continue;
    const bucket = priceBucket(item.budget_pln);
    const categories = new Set(item.tags.map((tag) => TAG_CATEGORY[tag as AllowedTag]).filter((value): value is string => Boolean(value)));
    for (const category of categories) {
      const key = cellKey({ category, price_bucket: bucket, recipient: item.recipient });
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export type Gap = CoverageCell & { demand: number };

/**
 * Cells below the threshold, most demanded first, then the emptiest, then by name (stable). At most `max`.
 * A found product usually fits several recipients, so one night spreads over different category x price range pairs first;
 * only when fewer than `max` pairs are thin does it take a second recipient of the same pair.
 */
export function pickGaps(cells: readonly CoverageCell[], demand: readonly Demand[], max: number = MAX_CELLS_PER_NIGHT): { all: number; picked: Gap[] } {
  const wanted = demandByCell(demand);
  const gaps = belowThreshold(cells).map((cell) => ({ ...cell, demand: wanted.get(cellKey(cell)) ?? 0 }));
  gaps.sort((a, b) => b.demand - a.demand || a.active_count - b.active_count || cellKey(a).localeCompare(cellKey(b)));
  const picked: Gap[] = [];
  const pairs = new Set<string>();
  for (const gap of gaps) {
    const pair = `${gap.category}|${gap.price_bucket}`;
    if (picked.length < max && !pairs.has(pair)) {
      pairs.add(pair);
      picked.push(gap);
    }
  }
  for (const gap of gaps) if (picked.length < max && !picked.includes(gap)) picked.push(gap);
  return { all: gaps.length, picked };
}

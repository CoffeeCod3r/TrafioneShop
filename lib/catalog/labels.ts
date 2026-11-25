/** Polish labels of the pool coverage cells (admin panel, dry run, AI search request). Pure. */
import { RECIPIENT_OPTIONS } from "../quiz/schema.ts";
import { PRICE_BUCKETS, type CoverageCell } from "./pool.ts";

const CATEGORY_LABELS: Record<string, string> = {
  dom: "dom i wnętrze",
  ogrod: "ogród",
  kuchnia: "kuchnia",
  jedzenie: "jedzenie i napoje",
  ksiazki: "książki",
  gry: "gry i puzzle",
  elektronika: "elektronika i gadżety",
  sport: "sport i turystyka",
  moda: "moda i dodatki",
  uroda: "uroda i pielęgnacja",
  hobby: "hobby i rękodzieło",
  podroze: "podróże",
};

/** The targeted search request for one cell (Polish: it is also the search query's language). */
export function describeCell(cell: Pick<CoverageCell, "category" | "price_bucket" | "recipient">): { category: string; price: string; recipient: string } {
  const bucket = PRICE_BUCKETS.find((item) => item.id === cell.price_bucket)!;
  const recipient = RECIPIENT_OPTIONS.find((option) => option.value === cell.recipient)?.label ?? cell.recipient;
  return { category: CATEGORY_LABELS[cell.category] ?? cell.category, price: bucket.label, recipient };
}

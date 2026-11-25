/**
 * Targeted top-up of the product pool with the AI provider's web search (max 2 searches per cell, no web_fetch).
 * New products are saved as `pending`; run `npm run catalog:verify` afterwards (then `npm run catalog:tag`).
 *
 *   npm run catalog:build                                  the 10 emptiest, most asked-for cells below the threshold
 *   npm run catalog:build -- --cell kuchnia:50-100:mom     one named cell (category:price range:recipient), repeatable
 *   npm run catalog:build -- --max-cells 3
 *
 * PowerShell swallows the "--": use CELLS=kuchnia:50-100:mom,dom:do-50:dad and MAX_CELLS=3 there.
 * Provider: CATALOG_AI_PROVIDER (anthropic | demo), key ANTHROPIC_API_KEY. Hard cost limit: NIGHTLY_AI_BUDGET_USD (default 0.30).
 * Every AI call is recorded in ai_usage (step catalog_build).
 */
import { parseArgs } from "node:util";

import { buildCells, type BuildCell } from "../lib/catalog/build.ts";
import { pickGaps } from "../lib/catalog/gaps.ts";
import { POOL_CATEGORIES, POOL_RECIPIENTS, PRICE_BUCKETS } from "../lib/catalog/pool.ts";
import { createProvider } from "../lib/catalog/provider.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

const { values } = parseArgs({ options: { cell: { type: "string", multiple: true }, "max-cells": { type: "string" } }, strict: false });
const cellArgs = [...((values.cell as string[] | undefined) ?? []), ...(process.env.CELLS ? process.env.CELLS.split(",") : [])];
const maxCells = Number.parseInt(String(values["max-cells"] ?? process.env.MAX_CELLS ?? "10"), 10);
const budget = Number(process.env.NIGHTLY_AI_BUDGET_USD ?? "0.30");
if (!Number.isFinite(budget) || budget <= 0) {
  console.error("NIGHTLY_AI_BUDGET_USD musi być dodatnią liczbą.");
  process.exit(1);
}

const repos = getRepos();
console.log(`Baza: ${isRealService("db") ? "Supabase" : "plik demo"} · limit kosztów $${budget.toFixed(2)}`);

let cells: BuildCell[];
if (cellArgs.length > 0) {
  cells = cellArgs.map((text) => {
    const [category, price_bucket, recipient] = text.split(":");
    const valid =
      (POOL_CATEGORIES as readonly string[]).includes(category) &&
      PRICE_BUCKETS.some((bucket) => bucket.id === price_bucket) &&
      POOL_RECIPIENTS.includes(recipient);
    if (!valid) {
      console.error(`Zła komórka "${text}". Format: kategoria:przedział:odbiorca, np. kuchnia:50-100:mom (przedziały: ${PRICE_BUCKETS.map((b) => b.id).join(", ")}).`);
      process.exit(1);
    }
    return { category, price_bucket: price_bucket as BuildCell["price_bucket"], recipient };
  });
} else {
  const demand = await repos.catalog.recentDemand(new Date(Date.now() - 7 * 86_400_000).toISOString());
  const { all, picked } = pickGaps(await repos.catalog.poolCoverage(), demand, maxCells);
  console.log(`Komórek poniżej progu: ${all}, uzupełniam ${picked.length}`);
  cells = picked;
}

const result = await buildCells({ repos, provider: createProvider(), cells, budgetUsd: budget, log: (message) => console.log(message) });
const added = result.cells.reduce((sum, cell) => sum + cell.added, 0);
console.log(`\nZapytań AI: ${result.aiCalls} · nowych produktów (pending): ${added} · koszt $${result.spentUsd.toFixed(4)}${result.stoppedByBudget ? " · PRZERWANO: limit kosztów" : ""}`);
console.log("Dalej: npm run catalog:verify, potem npm run catalog:tag");
if (result.errors.length > 0) process.exitCode = 1;

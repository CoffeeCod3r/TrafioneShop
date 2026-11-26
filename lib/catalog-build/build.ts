/**
 * Nightly pool top-up (npm run catalog:nightly / catalog:build / catalog:tag).
 *
 * 1. chooseCells: up to 10 pool cells (category x price band x recipient) below the health threshold, the ones
 *    people actually asked for in the last 7 days first.
 * 2. findProductsForCell: Claude with web_search only (max_uses 2 per cell, NO web_fetch) proposes product pages
 *    from the allowed shops.
 * 3. verifyCandidates: OUR code opens every proposed page (allowed shop domain, robots.txt, 1 request/s per domain,
 *    price and availability from JSON-LD/meta, price inside the cell's band). Only pages that pass are saved, as
 *    status active / source catalog_build. This replaces the web_fetch proof of the live search: the page was opened
 *    by the server itself, never trusted from the AI's words.
 * 4. tagProducts: Claude (no tools) fills tags / recipients / gift types / lifestyles of untagged products.
 * The commission is never part of any prompt or ordering. Every call has max_tokens; usage is returned for ai_usage.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { usageCostUsd } from "../ai/cost.ts";
import { checkUrl, type CheckDeps } from "../catalog-check/check.ts";
import type { Polite } from "../catalog-check/polite.ts";
import { externalIdForUrl, type UsageEntry } from "../search/core.ts";
import { ALLOWED_TAGS, isAllowedTag } from "../tags.ts";
import type { BuiltProductInput } from "../services/db.ts";
import { bandLimits, bandOfBudget, POOL_HEALTHY_MIN, type PoolCoverageRow } from "./coverage.ts";

export const MAX_CELLS_PER_NIGHT = 10;
export const SEARCHES_PER_CELL = 2;
export const PRODUCTS_PER_CELL = 6;
/** Rough cost of one cell (2 searches + tokens), used to stop before the budget would be crossed. */
export const ESTIMATED_CELL_COST_USD = 0.035;
const BUILD_MAX_TOKENS = 2_500;
const TAG_MAX_TOKENS = 3_000;
const TAG_BATCH = 20;
const REQUEST_TIMEOUT_MS = 90_000;

const RECIPIENT_CODES = ["dad", "mom", "girlfriend", "boyfriend", "friend", "boss", "grandparent"] as const;
const GIFT_TYPE_CODES = ["thing", "experience", "practical", "funny"] as const;
const LIFESTYLE_CODES = ["homebody", "athlete", "gamer", "traveler", "artist", "workaholic"] as const;

const RECIPIENT_LABELS: Record<string, string> = {
  dad: "taty",
  mom: "mamy",
  girlfriend: "dziewczyny",
  boyfriend: "chłopaka",
  friend: "przyjaciela lub przyjaciółki",
  boss: "szefa lub szefowej",
  grandparent: "dziadka lub babci",
};

/** Categories that are too vague to search for. */
const SKIPPED_CATEGORIES = new Set(["inne"]);

export type Cell = { category: string; band: string; recipient: string; active: number; demand: number };

export function chooseCells(
  coverage: PoolCoverageRow[],
  demand: { recipient: string | null; budget_pln: number | null }[],
  max = MAX_CELLS_PER_NIGHT,
): Cell[] {
  const asked = new Map<string, number>();
  for (const row of demand) {
    const band = bandOfBudget(row.budget_pln);
    if (!row.recipient || !band) continue;
    const key = `${row.recipient}|${band}`;
    asked.set(key, (asked.get(key) ?? 0) + 1);
  }
  return coverage
    .filter((row) => !row.healthy && !SKIPPED_CATEGORIES.has(row.category))
    .map((row) => ({ category: row.category, band: row.band, recipient: row.recipient, active: row.active, demand: asked.get(`${row.recipient}|${row.band}`) ?? 0 }))
    .sort((a, b) => b.demand - a.demand || a.active - b.active || a.category.localeCompare(b.category) || a.band.localeCompare(b.band))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// AI: propose products for one cell
// ---------------------------------------------------------------------------

const proposedSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().min(3).max(200),
        url: z.string().url().max(2000),
        shop: z.string().max(100).optional(),
        price_pln: z.number().positive().max(100_000).optional(),
        tags: z.array(z.string()).max(8).default([]),
        recipients: z.array(z.string()).max(7).default([]),
        gift_types: z.array(z.string()).max(4).default([]),
        lifestyles: z.array(z.string()).max(6).default([]),
      }),
    )
    .max(PRODUCTS_PER_CELL + 4),
});
export type ProposedProduct = z.infer<typeof proposedSchema>["products"][number];

const SAVE_PRODUCTS_TOOL = "save_products";

function saveProductsTool(): Anthropic.Tool {
  return {
    name: SAVE_PRODUCTS_TOOL,
    description: "Zapisz znalezione produkty (adresy stron produktów z wyników wyszukiwania).",
    input_schema: {
      type: "object",
      properties: {
        products: {
          type: "array",
          maxItems: PRODUCTS_PER_CELL,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nazwa produktu" },
              url: { type: "string", description: "Adres strony produktu w sklepie (nie listy, nie strony głównej)" },
              shop: { type: "string" },
              price_pln: { type: "number" },
              tags: { type: "array", items: { type: "string", enum: [...ALLOWED_TAGS] } },
              recipients: { type: "array", items: { type: "string", enum: [...RECIPIENT_CODES] } },
              gift_types: { type: "array", items: { type: "string", enum: [...GIFT_TYPE_CODES] } },
              lifestyles: { type: "array", items: { type: "string", enum: [...LIFESTYLE_CODES] } },
            },
            required: ["name", "url", "tags", "gift_types"],
          },
        },
      },
      required: ["products"],
    },
  };
}

function buildPrompt(cell: Cell): string {
  const { min, max } = bandLimits(cell.band);
  return [
    `Szukam prezentów dla ${RECIPIENT_LABELS[cell.recipient] ?? cell.recipient} w kategorii „${cell.category}”, w cenie od ${min} do ${max} zł.`,
    `Użyj wyszukiwarki (najwyżej ${SEARCHES_PER_CELL} wyszukiwania) i wybierz do ${PRODUCTS_PER_CELL} konkretnych produktów z polskich sklepów internetowych.`,
    "Podawaj wyłącznie adresy stron pojedynczych produktów, które widzisz w wynikach wyszukiwania. Nie wymyślaj adresów.",
    "Nie podawaj stron kategorii, list, wyszukiwarek ani stron głównych. Wybieraj według dopasowania do osoby i kategorii.",
    `Na koniec wywołaj narzędzie ${SAVE_PRODUCTS_TOOL}. Tagi wybieraj tylko z listy w narzędziu.`,
  ].join("\n");
}

export type CellSearch = { products: ProposedProduct[]; usage: UsageEntry };

export async function findProductsForCell(client: Anthropic, model: string, cell: Cell, shopDomains: string[]): Promise<CellSearch> {
  const usage: UsageEntry = { step: "catalog_build", model, inputTokens: 0, outputTokens: 0, webSearches: 0, webFetches: 0 };
  // Validation failure: retry once, then give up on this cell (nothing is saved).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(cell) }];
    for (let request = 0; request < 3; request++) {
      const searchesLeft = Math.max(1, SEARCHES_PER_CELL - (usage.webSearches ?? 0));
      const message = await client.messages.create(
        {
          model,
          max_tokens: BUILD_MAX_TOKENS,
          tools: [
            {
              type: "web_search_20260318",
              name: "web_search",
              max_uses: searchesLeft,
              allowed_domains: shopDomains,
              allowed_callers: ["direct"],
              user_location: { type: "approximate", country: "PL", timezone: "Europe/Warsaw" },
            },
            saveProductsTool(),
          ],
          messages,
        },
        { timeout: REQUEST_TIMEOUT_MS },
      );
      usage.model = message.model ?? model;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.webSearches = (usage.webSearches ?? 0) + (message.usage.server_tool_use?.web_search_requests ?? 0);
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content as Anthropic.ContentBlockParam[] });
        continue;
      }
      const save = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SAVE_PRODUCTS_TOOL,
      );
      const parsed = proposedSchema.safeParse(save?.input);
      if (parsed.success) return { products: parsed.data.products.slice(0, PRODUCTS_PER_CELL), usage };
      break;
    }
    if ((usage.webSearches ?? 0) >= SEARCHES_PER_CELL) break; // no second attempt once the searches are used up
  }
  return { products: [], usage };
}

// ---------------------------------------------------------------------------
// Code verification of the proposals (no AI)
// ---------------------------------------------------------------------------

export type VerifyCandidateDeps = {
  fetch: CheckDeps["fetch"];
  polite: Polite;
  shopDomains: string[];
  now: () => number;
};

export type CandidateVerdict = { url: string; ok: boolean; reason: string };

const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function onlyCodes<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return [...new Set(values.filter((value): value is T => (allowed as readonly string[]).includes(value)))];
}

export async function verifyCandidates(
  cell: Cell,
  proposals: ProposedProduct[],
  deps: VerifyCandidateDeps,
): Promise<{ products: BuiltProductInput[]; verdicts: CandidateVerdict[] }> {
  const { min, max } = bandLimits(cell.band);
  const products: BuiltProductInput[] = [];
  const verdicts: CandidateVerdict[] = [];
  const isShop = (host: string) => deps.shopDomains.some((domain) => matches(host, domain));

  await Promise.all(
    proposals.map(async (proposal) => {
      let host: string;
      try {
        const parsed = new URL(proposal.url);
        if (parsed.protocol !== "https:") throw new Error("not https");
        host = parsed.hostname.toLowerCase();
      } catch {
        verdicts.push({ url: proposal.url, ok: false, reason: "bad_url" });
        return;
      }
      if (!isShop(host)) {
        verdicts.push({ url: proposal.url, ok: false, reason: "shop_not_allowed" });
        return;
      }
      const checkDeps: CheckDeps = { fetch: deps.fetch, isAllowedHost: isShop, beforeRequest: deps.polite.waitForTurn };
      if (!(await deps.polite.allows(proposal.url, checkDeps))) {
        verdicts.push({ url: proposal.url, ok: false, reason: "robots" });
        return;
      }
      const outcome = await checkUrl(proposal.url, checkDeps);
      if (outcome.kind !== "ok") {
        verdicts.push({ url: proposal.url, ok: false, reason: outcome.kind === "sold_out" ? "sold_out" : `${outcome.kind}:${"reason" in outcome ? outcome.reason : ""}` });
        return;
      }
      if (outcome.price === null) {
        verdicts.push({ url: proposal.url, ok: false, reason: "no_price_on_page" });
        return;
      }
      if (outcome.price <= min || outcome.price > max) {
        verdicts.push({ url: proposal.url, ok: false, reason: `price_outside_band:${outcome.price}` });
        return;
      }
      const tags = proposal.tags.filter(isAllowedTag);
      products.push({
        external_id: await externalIdForUrl(proposal.url),
        merchant: proposal.shop?.trim() || host.replace(/^www\./, ""),
        name: proposal.name.trim(),
        price_pln: outcome.price,
        category: cell.category,
        tags,
        recipients: onlyCodes(proposal.recipients, RECIPIENT_CODES),
        gift_types: onlyCodes(proposal.gift_types, GIFT_TYPE_CODES),
        lifestyles: onlyCodes(proposal.lifestyles, LIFESTYLE_CODES),
        url: proposal.url,
        final_url: outcome.finalUrl,
        checked_at: new Date(deps.now()).toISOString(),
      });
      verdicts.push({ url: proposal.url, ok: true, reason: `ok:${outcome.price}` });
    }),
  );
  return { products, verdicts };
}

// ---------------------------------------------------------------------------
// AI: tags for untagged products
// ---------------------------------------------------------------------------

const tagsSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      tags: z.array(z.string()).max(8),
      recipients: z.array(z.string()).max(7).default([]),
      gift_types: z.array(z.string()).max(4).default([]),
      lifestyles: z.array(z.string()).max(6).default([]),
    }),
  ),
});

export type TagPatch = { id: string; tags: string[]; recipients: string[]; gift_types: string[]; lifestyles: string[] };

export async function tagProducts(
  client: Anthropic,
  model: string,
  products: { id: string; name: string; category: string | null; price_pln: number }[],
): Promise<{ patches: TagPatch[]; usage: UsageEntry }> {
  const usage: UsageEntry = { step: "catalog_tag", model, inputTokens: 0, outputTokens: 0 };
  const patches: TagPatch[] = [];
  for (let start = 0; start < products.length; start += TAG_BATCH) {
    const batch = products.slice(start, start + TAG_BATCH);
    const list = batch.map((product) => `${product.id} | ${product.name} | ${product.category ?? "-"} | ${product.price_pln} zł`).join("\n");
    const tool: Anthropic.Tool = {
      name: "save_tags",
      description: "Zapisz tagi produktów.",
      input_schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                tags: { type: "array", items: { type: "string", enum: [...ALLOWED_TAGS] } },
                recipients: { type: "array", items: { type: "string", enum: [...RECIPIENT_CODES] } },
                gift_types: { type: "array", items: { type: "string", enum: [...GIFT_TYPE_CODES] } },
                lifestyles: { type: "array", items: { type: "string", enum: [...LIFESTYLE_CODES] } },
              },
              required: ["id", "tags", "gift_types"],
            },
          },
        },
        required: ["products"],
      },
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const message = await client.messages.create(
        {
          model,
          max_tokens: TAG_MAX_TOKENS,
          tools: [tool],
          tool_choice: { type: "tool", name: "save_tags" },
          messages: [
            {
              role: "user",
              content:
                "Przypisz każdemu produktowi 1-4 tagi z listy, typ prezentu, a odbiorców i styl życia tylko gdy produkt wyraźnie do nich pasuje " +
                "(pusta lista = pasuje do każdego). Format wiersza: id | nazwa | kategoria | cena.\n" +
                list,
            },
          ],
        },
        { timeout: REQUEST_TIMEOUT_MS },
      );
      usage.model = message.model ?? model;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      const call = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      const parsed = tagsSchema.safeParse(call?.input);
      if (!parsed.success) continue;
      const ids = new Set(batch.map((product) => product.id));
      for (const item of parsed.data.products) {
        if (!ids.has(item.id)) continue;
        const tags = item.tags.filter(isAllowedTag);
        if (tags.length === 0) continue;
        patches.push({
          id: item.id,
          tags,
          recipients: onlyCodes(item.recipients, RECIPIENT_CODES),
          gift_types: onlyCodes(item.gift_types, GIFT_TYPE_CODES),
          lifestyles: onlyCodes(item.lifestyles, LIFESTYLE_CODES),
        });
      }
      break;
    }
  }
  return { patches, usage };
}

export function costUsd(entries: UsageEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + usageCostUsd({ input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, web_searches: entry.webSearches ?? 0 }),
    0,
  );
}

export { POOL_HEALTHY_MIN };

/**
 * `catalog:build`: targeted top-up of the pool. For each cell (category x price range x recipient) the AI provider
 * (lib/catalog/provider.ts) proposes products with its web search; the proposals are checked server-side (https, an
 * active allowed shop, a product-like address) and saved as `pending`, source `catalog_build`. Nothing becomes
 * `active` here: that is what lib/catalog/verify.ts does afterwards, with plain HTTP and no AI.
 * Hard cost limit: before every AI call the worst-case cost of that call must fit in what is left of the budget.
 */
import { usageCostUsd } from "../ai/cost.ts";
import type { AllowedShopRow } from "../db.ts";
import type { Repos, PoolProductInput } from "../services/db.ts";
import { externalIdForUrl, normalizeUrl, todayInWarsaw, toOutboundUrl } from "../search/core.ts";
import { poolCategory, POOL_RECIPIENTS, type CoverageCell } from "./pool.ts";
import { describeCell } from "./labels.ts";
import type { CatalogAiProvider, Proposal } from "./provider.ts";

/** Worst case of one targeted search: 2 searches (0.02) + input and output tokens at the Haiku prices. */
export const CELL_COST_ESTIMATE_USD = 0.03;

export type BuildCell = Pick<CoverageCell, "category" | "price_bucket" | "recipient"> & { demand?: number };

export type CellReport = { category: string; price_bucket: string; recipient: string; demand: number; found: number; added: number; ids: string[] };

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Server-side check of what the AI proposed: https, an active allowed shop, an address deeper than the home page. */
export async function acceptProposals(proposals: readonly Proposal[], shops: readonly AllowedShopRow[], cell: Pick<BuildCell, "category">): Promise<{ rows: PoolProductInput[]; rejected: number }> {
  const rows: PoolProductInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const proposal of proposals) {
    const normalized = normalizeUrl(proposal.url);
    const url = normalized ? new URL(normalized) : null;
    const shop = url ? shops.find((item) => item.active && domainMatches(url.hostname, item.domain)) : undefined;
    if (!normalized || !url || !shop || url.protocol !== "https:" || url.pathname.replace(/\/$/, "") === "" || seen.has(normalized)) {
      rejected += 1;
      continue;
    }
    seen.add(normalized);
    const recipients = [...new Set((proposal.recipients ?? []).filter((code) => POOL_RECIPIENTS.includes(code)))];
    rows.push({
      merchant: shop.name,
      external_id: await externalIdForUrl(normalized),
      name: proposal.name,
      price_pln: proposal.price_pln,
      category: poolCategory(cell.category) ?? cell.category,
      tags: [],
      affiliate_url: toOutboundUrl(normalized, shop),
      url: normalized,
      // Suits everyone (or the AI named all of them): the empty list means "any recipient".
      recipients: recipients.length === POOL_RECIPIENTS.length ? [] : recipients,
    });
  }
  return { rows, rejected };
}

export type BuildOptions = {
  repos: Repos;
  provider: CatalogAiProvider;
  cells: readonly BuildCell[];
  budgetUsd: number;
  /** Budget already spent earlier in the same job. */
  spentUsd?: number;
  now?: () => number;
  log?: (message: string) => void;
};

export type BuildResult = {
  cells: CellReport[];
  aiCalls: number;
  spentUsd: number;
  stoppedByBudget: boolean;
  errors: string[];
};

export async function buildCells(options: BuildOptions): Promise<BuildResult> {
  const { repos, provider } = options;
  const log = options.log ?? (() => {});
  const shops = await repos.allowedShops.listActive();
  const result: BuildResult = { cells: [], aiCalls: 0, spentUsd: options.spentUsd ?? 0, stoppedByBudget: false, errors: [] };

  for (const cell of options.cells) {
    if (result.spentUsd + CELL_COST_ESTIMATE_USD > options.budgetUsd) {
      result.stoppedByBudget = true;
      log(`   limit kosztów: wydano $${result.spentUsd.toFixed(4)} z $${options.budgetUsd.toFixed(2)}, kolejne zapytanie mogłoby go przekroczyć`);
      break;
    }
    const label = describeCell(cell);
    const entry: CellReport = { category: cell.category, price_bucket: cell.price_bucket, recipient: cell.recipient, demand: cell.demand ?? 0, found: 0, added: 0, ids: [] };
    result.cells.push(entry);
    result.aiCalls += 1;
    log(`   ${label.category} · ${label.price} · ${label.recipient}`);
    try {
      const output = await provider.findProducts({ cell, shops, today: todayInWarsaw(new Date((options.now ?? Date.now)())) });
      const cost = output.usage.reduce(
        (sum, usage) => sum + usageCostUsd({ input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, web_searches: usage.webSearches ?? 0 }),
        0,
      );
      result.spentUsd += cost;
      if (output.usage.length > 0) {
        await repos.aiUsage.createMany(
          output.usage.map((usage) => ({
            result_id: null,
            step: usage.step,
            model: usage.model,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            web_searches: usage.webSearches ?? 0,
            web_fetches: 0,
          })),
        );
      }
      const { rows, rejected } = await acceptProposals(output.proposals, shops, cell);
      entry.found = rows.length;
      const saved = await repos.products.savePool(rows);
      entry.added = saved.length;
      entry.ids = saved.map((product) => product.id);
      log(`     AI zaproponowało ${output.proposals.length}, przyjęto ${rows.length} (odrzucone ${rejected}), nowych w bazie ${saved.length}, koszt $${cost.toFixed(4)}`);
    } catch (error) {
      // The cost of a failed call is unknown: charge the worst case, so the limit stays hard.
      result.spentUsd += CELL_COST_ESTIMATE_USD;
      const message = error instanceof Error ? error.message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[klucz]").slice(0, 200) : "nieznany błąd";
      result.errors.push(message);
      log(`     błąd AI: ${message}`);
    }
  }
  return result;
}

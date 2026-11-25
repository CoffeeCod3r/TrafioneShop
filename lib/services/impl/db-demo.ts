import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import demoShops from "../../../data/demo-shops.json" with { type: "json" };
import sampleProducts from "../../../data/sample-products.json" with { type: "json" };
import type {
  AiUsageRow,
  AllowedShopRow,
  CatalogCheckRunRow,
  CatalogRunRow,
  ClickRow,
  GuideProductRow,
  PriceHistoryRow,
  ProductRow,
  PurchaseRow,
  QuizStartRow,
  RateLimitRow,
  ResultRow,
  SubscriberRow,
} from "../../db.ts";
import { computeCoverage, isPoolFresh, POOL_MIN_PER_CELL } from "../../catalog/pool.ts";
import type { Repos } from "../db.ts";

/**
 * Demo database: a JSON file (default .data/demo-db.json, git-ignored).
 * On Vercel previews the project folder is read-only, so /tmp is used there.
 * Delete the file to reset the demo data.
 */

type DemoData = {
  products: ProductRow[];
  results: ResultRow[];
  clicks: ClickRow[];
  purchases: PurchaseRow[];
  subscribers: SubscriberRow[];
  allowed_shops: AllowedShopRow[];
  ai_usage: AiUsageRow[];
  rate_limits: RateLimitRow[];
  quiz_starts: QuizStartRow[];
  guide_products: GuideProductRow[];
  catalog_check_runs: CatalogCheckRunRow[];
  catalog_runs: CatalogRunRow[];
  price_history: PriceHistoryRow[];
};

export function demoDbPath(): string {
  if (process.env.DEMO_DB_PATH) return process.env.DEMO_DB_PATH;
  if (process.env.VERCEL) return "/tmp/demo-db.json";
  return path.join(process.cwd(), ".data", "demo-db.json");
}

function emptyData(): DemoData {
  return {
    products: [],
    results: [],
    clicks: [],
    purchases: [],
    subscribers: [],
    allowed_shops: [],
    ai_usage: [],
    rate_limits: [],
    quiz_starts: [],
    guide_products: [],
    catalog_check_runs: [],
    catalog_runs: [],
    price_history: [],
  };
}

/** First run: sample catalog and shops. Deterministic (no random IDs) so reads are stable. */
function initialData(): DemoData {
  return {
    ...emptyData(),
    products: structuredClone(sampleProducts) as ProductRow[],
    allowed_shops: demoShops.map((shop, index) => ({
      id: `d5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      active: true,
      ...shop,
    })),
  };
}

const now = () => new Date().toISOString();

// All access is serialized so concurrent requests cannot lose writes.
let queue: Promise<unknown> = Promise.resolve();

async function load(file: string): Promise<DemoData> {
  try {
    return { ...emptyData(), ...(JSON.parse(await readFile(file, "utf8")) as Partial<DemoData>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialData();
    throw new Error("Demo database file is corrupted. Delete it to reset the demo data.");
  }
}

async function save(file: string, data: DemoData): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2));
  await rename(temp, file);
}

function withData<T>(fn: (data: DemoData) => T, options: { write: boolean }): Promise<T> {
  const run = queue.then(async () => {
    const file = demoDbPath();
    const data = await load(file);
    const result = fn(data);
    if (options.write) await save(file, data);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

const read = <T>(fn: (data: DemoData) => T) => withData(fn, { write: false });
const write = <T>(fn: (data: DemoData) => T) => withData(fn, { write: true });

function byPriceDesc(a: ProductRow, b: ProductRow): number {
  return b.price_pln - a.price_pln;
}

/**
 * Demo products have no shop page to verify, and a demo database file created before the pool existed has no status:
 * both count as fresh. Everything else follows the real rule (active and verified in the last 7 days).
 */
function demoPoolFresh(product: ProductRow): boolean {
  if (product.network === "demo" || product.status === undefined) return true;
  return isPoolFresh(product);
}

export function createDemoRepos(): Repos {
  return {
    catalog: {
      listCheckable: () =>
        read((data) => {
          const guideIds = new Set(data.guide_products.map((link) => link.product_id));
          return data.products
            .filter((product) => product.in_stock && (product.network === "direct" || guideIds.has(product.id)))
            .map(({ id, name, url, affiliate_url, price_pln, network, category, failed_checks, in_stock }) => ({
              id,
              name,
              url: url ?? null,
              affiliate_url,
              price_pln,
              network,
              category,
              failed_checks: failed_checks ?? 0,
              in_stock,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        }),
      applyCheck: (productId, patch, history) =>
        write((data) => {
          const product = data.products.find((item) => item.id === productId);
          if (!product) throw new Error("Saving product check failed (not found)");
          Object.assign(product, patch);
          if (history) data.price_history.push({ id: randomUUID(), product_id: productId, checked_at: now(), ...history });
        }),
      createRun: (startedBy) =>
        write((data) => {
          const run: CatalogCheckRunRow = {
            id: randomUUID(),
            started_by: startedBy,
            started_at: now(),
            finished_at: null,
            status: "running",
            total: 0,
            processed: 0,
            cursor: null,
            ok: 0,
            price_changes: 0,
            became_unavailable: 0,
            skipped_robots: 0,
            unverified: 0,
            errors: 0,
            failures: {},
            guides_incomplete: [],
          };
          data.catalog_check_runs.push(run);
          return run;
        }),
      getRun: (id) => read((data) => data.catalog_check_runs.find((run) => run.id === id) ?? null),
      updateRun: (id, patch) =>
        write((data) => {
          const run = data.catalog_check_runs.find((item) => item.id === id);
          if (!run) throw new Error("Updating check run failed (not found)");
          Object.assign(run, patch);
        }),
      recentRuns: (limit) =>
        read((data) => [...data.catalog_check_runs].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit)),
      countProducts: () =>
        read((data) => ({
          available: data.products.filter((product) => product.in_stock).length,
          unavailable: data.products.filter((product) => !product.in_stock).length,
        })),
      listForVerify: ({ onlyStale, staleBeforeIso, ids }) =>
        read((data) =>
          data.products
            .filter(
              (p) =>
                p.network !== "demo" &&
                (!ids || ids.includes(p.id)) &&
                (!onlyStale || !p.last_check_at || p.last_check_at < staleBeforeIso || (p.fail_count ?? 0) > 0),
            )
            .sort((a, b) => (a.last_check_at ?? "").localeCompare(b.last_check_at ?? "") || a.id.localeCompare(b.id))
            .map((p) => ({
              id: p.id,
              name: p.name,
              url: p.url,
              affiliate_url: p.affiliate_url,
              network: p.network,
              price_pln: p.price_pln,
              status: p.status ?? (p.in_stock ? "active" : "out_of_stock"),
              fail_count: p.fail_count ?? 0,
              source: p.source ?? "manual",
            })),
        ),
      applyVerification: (productId, patch, history) =>
        write((data) => {
          const product = data.products.find((p) => p.id === productId);
          if (!product) throw new Error("Saving product verification failed (not found)");
          const { last_checked_at, ...rest } = patch;
          Object.assign(product, rest, { failed_checks: patch.fail_count, updated_at: now() });
          if (last_checked_at) Object.assign(product, { last_checked_at, checked_at: last_checked_at });
          // The database trigger does this in the real implementation.
          if (patch.status) product.in_stock = patch.status === "active";
          if (history) data.price_history.push({ id: randomUUID(), product_id: productId, ...history, checked_at: now() });
        }),
      recentDemand: (since) =>
        read((data) =>
          data.results
            .filter((result) => result.created_at >= since)
            .map((result) => ({ recipient: result.recipient, budget_pln: result.budget_pln, tags: result.tags })),
        ),
      createNightlyRun: (trigger) =>
        write((data) => {
          const run: CatalogRunRow = {
            id: randomUUID(),
            started_at: now(),
            finished_at: null,
            trigger,
            status: "running",
            checked: 0,
            active: 0,
            broken: 0,
            out_of_stock: 0,
            price_changes: 0,
            unverifiable: 0,
            added: 0,
            cells_below_threshold: 0,
            cells_targeted: [],
            ai_calls: 0,
            ai_cost_usd: 0,
            duration_ms: null,
            notes: {},
          };
          data.catalog_runs ??= [];
          data.catalog_runs.push(run);
          return run;
        }),
      updateNightlyRun: (id, patch) =>
        write((data) => {
          const run = (data.catalog_runs ?? []).find((item) => item.id === id);
          if (!run) throw new Error("Updating catalog run failed (not found)");
          Object.assign(run, patch);
        }),
      latestNightlyRun: () =>
        read((data) => [...(data.catalog_runs ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null),
      poolCoverage: () =>
        read((data) =>
          computeCoverage(data.products).map((cell) => ({ ...cell, threshold: POOL_MIN_PER_CELL, below_threshold: cell.active_count < POOL_MIN_PER_CELL })),
        ),
      poolCounts: () =>
        read((data) => {
          const count = (status: string) => data.products.filter((product) => (product.status ?? (product.in_stock ? "active" : "out_of_stock")) === status).length;
          return {
            active: count("active"),
            broken: count("broken"),
            out_of_stock: count("out_of_stock"),
            pending: count("pending"),
            stale_active: data.products.filter((product) => product.status === "active" && !isPoolFresh(product)).length,
          };
        }),
    },
    guides: {
      listProducts: (slug) =>
        read((data) =>
          data.guide_products
            .filter((link) => link.guide_slug === slug)
            .sort((a, b) => a.position - b.position)
            .flatMap((link) => {
              const product = data.products.find((item) => item.id === link.product_id);
              return product?.in_stock
                ? [{ position: link.position, reason: link.reason, refreshedAt: link.refreshed_at, product }]
                : [];
            }),
        ),
      replaceProducts: (slug, rows) =>
        write((data) => {
          data.guide_products = data.guide_products.filter((link) => link.guide_slug !== slug);
          const refreshedAt = now();
          for (const row of rows) {
            data.guide_products.push({ ...row, guide_slug: slug, refreshed_at: refreshedAt });
          }
        }),
    },

    products: {
      upsertMany: (rows) =>
        write((data) => {
          for (const row of rows) {
            const existing = data.products.find(
              (product) => product.network === row.network && product.external_id === row.external_id,
            );
            if (existing) Object.assign(existing, row, { updated_at: now() });
            else
              data.products.push({
                id: randomUUID(),
                description: null,
                category: null,
                tags: [],
                image_url: null,
                commission_rate: null,
                in_stock: true,
                url: null,
                checked_at: null,
                failed_checks: 0,
                last_check_at: null,
                last_check_result: null,
                status: "pending",
                last_checked_at: null,
                fail_count: 0,
                price_checked: null,
                ...row,
                source: "feed",
                updated_at: now(),
              });
          }
        }),
      listInStockExternalIds: (network) =>
        read((data) => data.products.filter((p) => p.network === network && p.in_stock).map((p) => p.external_id)),
      markOutOfStock: (network, externalIds) =>
        write((data) => {
          const ids = new Set(externalIds);
          for (const product of data.products) {
            if (product.network === network && ids.has(product.external_id)) {
              product.in_stock = false;
              if (product.status === "active" || product.status === "pending") product.status = "out_of_stock";
              product.updated_at = now();
            }
          }
        }),
      findCandidates: ({ minPrice, maxPrice, anyOfTags, noneOfTags, recipient, category, excludeIds, limit }) =>
        read((data) =>
          data.products
            .filter(
              (p) =>
                p.in_stock &&
                demoPoolFresh(p) &&
                p.price_pln >= minPrice &&
                p.price_pln <= maxPrice &&
                (!anyOfTags?.length || p.tags.some((tag) => anyOfTags.includes(tag))) &&
                !(noneOfTags?.length && p.tags.some((tag) => noneOfTags.includes(tag))) &&
                (!recipient || !p.recipients?.length || p.recipients.includes(recipient)) &&
                (!category || p.category === category) &&
                !excludeIds?.includes(p.id),
            )
            .sort(byPriceDesc)
            .slice(0, limit),
        ),
      saveDirect: (rows) =>
        write((data) => {
          const saved: ProductRow[] = [];
          for (const row of rows) {
            const existing = data.products.find((p) => p.network === "direct" && p.external_id === row.external_id);
            if (existing) {
              Object.assign(existing, row, {
                commission_rate: 0,
                in_stock: true,
                status: "active",
                last_checked_at: row.checked_at,
                last_check_at: row.checked_at,
                price_checked: row.price_pln,
                fail_count: 0,
                source: "catalog_build",
                updated_at: now(),
              });
              saved.push(existing);
              continue;
            }
            const product: ProductRow = {
              id: randomUUID(),
              failed_checks: 0,
              last_check_result: null,
              ...row,
              network: "direct",
              commission_rate: 0,
              in_stock: true,
              status: "active",
              last_checked_at: row.checked_at,
              last_check_at: row.checked_at,
              price_checked: row.price_pln,
              fail_count: 0,
              source: "catalog_build",
              updated_at: now(),
            };
            data.products.push(product);
            saved.push(product);
          }
          return saved;
        }),
      savePool: (rows) =>
        write((data) => {
          const saved: ProductRow[] = [];
          for (const row of rows) {
            if (data.products.some((p) => p.network === "direct" && p.external_id === row.external_id)) continue;
            const product: ProductRow = {
              id: randomUUID(),
              description: null,
              image_url: null,
              commission_rate: 0,
              failed_checks: 0,
              last_check_at: null,
              last_check_result: null,
              checked_at: null,
              ...row,
              network: "direct",
              in_stock: false,
              status: "pending",
              last_checked_at: null,
              fail_count: 0,
              price_checked: null,
              source: "catalog_build",
              updated_at: now(),
            };
            data.products.push(product);
            saved.push(product);
          }
          return saved;
        }),
      setTags: (id, tags) =>
        write((data) => {
          const product = data.products.find((p) => p.id === id);
          if (product) product.tags = tags;
        }),
      getByIds: (ids) => read((data) => data.products.filter((p) => ids.includes(p.id))),
      getById: (id) => read((data) => data.products.find((p) => p.id === id) ?? null),
    },

    results: {
      create: (row) =>
        write((data) => {
          if (row.ref_code && data.results.some((result) => result.ref_code === row.ref_code)) {
            throw Object.assign(new Error("Saving result failed (23505)"), { code: "23505" });
          }
          const result: ResultRow = {
            id: randomUUID(),
            created_at: now(),
            recipient: null,
            budget_pln: null,
            occasion: null,
            answers: {},
            style_profile: null,
            tags: [],
            avoid: [],
            product_ids: [],
            reasons: {},
            ref_code: null,
            price_variant: null,
            paid_status: "none",
            web_picks: null,
            dedications: null,
            source: null,
            pick_summary: null,
            search_status: "ready",
            free_source: null,
            quiz_hash: null,
            search_started_at: null,
            ...row,
          };
          data.results.push(result);
          return result;
        }),
      getById: (id) => read((data) => data.results.find((result) => result.id === id) ?? null),
      update: (id, patch) =>
        write((data) => {
          const result = data.results.find((item) => item.id === id);
          if (!result) throw new Error("Updating result failed (not found)");
          Object.assign(result, patch);
        }),
      claimPayment: (id) =>
        write((data) => {
          const result = data.results.find((item) => item.id === id);
          if (!result || result.paid_status !== "none") return false;
          result.paid_status = "pending";
          return true;
        }),
      findCachedByHash: (hash, since) =>
        read(
          (data) =>
            data.results
              .filter((r) => r.quiz_hash === hash && r.search_status === "ready" && r.created_at >= since)
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
        ),
      listForStats: (since) =>
        read((data) =>
          data.results
            .filter((result) => result.created_at >= since)
            .map(({ id, created_at, price_variant, paid_status, source, free_source }) => ({
              id,
              created_at,
              price_variant,
              paid_status,
              source: source ?? null,
              free_source: free_source ?? null,
            })),
        ),
    },

    clicks: {
      create: (row) =>
        write((data) => {
          const click: ClickRow = { id: randomUUID(), created_at: now(), result_id: null, product_id: null, ...row };
          data.clicks.push(click);
          return click;
        }),
      listSince: (since) => read((data) => data.clicks.filter((click) => click.created_at >= since)),
    },

    purchases: {
      createIfNew: (row) =>
        write((data) => {
          const existing = data.purchases.find((p) => p.stripe_session_id === row.stripe_session_id);
          if (existing) return { purchase: existing, created: false };
          const purchase: PurchaseRow = {
            id: randomUUID(),
            created_at: now(),
            result_id: null,
            payment_intent_id: null,
            status: "paid",
            offer: "single",
            searches_total: 1,
            searches_left: 0,
            pack_code: null,
            ...row,
          };
          data.purchases.push(purchase);
          return { purchase, created: true };
        }),
      getById: (id) => read((data) => data.purchases.find((p) => p.id === id) ?? null),
      getBySessionId: (sessionId) =>
        read((data) => data.purchases.find((p) => p.stripe_session_id === sessionId) ?? null),
      getByPackCode: (code) => read((data) => data.purchases.find((p) => p.pack_code === code) ?? null),
      consumeSearch: (id) =>
        write((data) => {
          const purchase = data.purchases.find((p) => p.id === id);
          if (!purchase || purchase.status !== "paid" || purchase.searches_left <= 0) return false;
          purchase.searches_left -= 1;
          return true;
        }),
      restoreSearch: (id) =>
        write((data) => {
          const purchase = data.purchases.find((p) => p.id === id);
          if (purchase && purchase.status === "paid") {
            purchase.searches_left = Math.min(purchase.searches_left + 1, purchase.searches_total);
          }
        }),
      update: (id, patch) =>
        write((data) => {
          const purchase = data.purchases.find((p) => p.id === id);
          if (!purchase) throw new Error("Updating purchase failed (not found)");
          Object.assign(purchase, patch);
        }),
      listByResult: (resultId) => read((data) => data.purchases.filter((purchase) => purchase.result_id === resultId)),
      listSince: (since) => read((data) => data.purchases.filter((purchase) => purchase.created_at >= since)),
    },

    subscribers: {
      upsertByEmail: (row) =>
        write((data) => {
          const email = row.email.toLowerCase();
          const existing = data.subscribers.find((s) => s.email === email);
          if (existing) {
            Object.assign(existing, row, { email });
            return existing;
          }
          const subscriber: SubscriberRow = {
            id: randomUUID(),
            consent_at: now(),
            confirmed_at: null,
            occasions: [],
            ...row,
            email,
          };
          data.subscribers.push(subscriber);
          return subscriber;
        }),
      getByEmail: (email) => read((data) => data.subscribers.find((s) => s.email === email.toLowerCase()) ?? null),
      updateByEmail: (email, patch) =>
        write((data) => {
          const subscriber = data.subscribers.find((s) => s.email === email.toLowerCase());
          if (subscriber) Object.assign(subscriber, patch);
        }),
      deleteByEmail: (email) =>
        write((data) => {
          const before = data.subscribers.length;
          data.subscribers = data.subscribers.filter((s) => s.email !== email.toLowerCase());
          return data.subscribers.length < before;
        }),
      deleteUnconfirmedOlderThan: (isoDate) =>
        write((data) => {
          const before = data.subscribers.length;
          data.subscribers = data.subscribers.filter((s) => s.confirmed_at !== null || s.consent_at >= isoDate);
          return before - data.subscribers.length;
        }),
    },

    allowedShops: {
      listActive: () => read((data) => data.allowed_shops.filter((shop) => shop.active)),
    },

    aiUsage: {
      createMany: (rows) =>
        write((data) => {
          for (const row of rows) {
            data.ai_usage.push({
              id: randomUUID(),
              created_at: now(),
              result_id: null,
              input_tokens: 0,
              output_tokens: 0,
              web_searches: 0,
              web_fetches: 0,
              ...row,
            });
          }
        }),
      listSince: (since) =>
        read((data) => data.ai_usage.filter((row) => row.created_at >= since).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    },

    quizStarts: {
      create: (row) =>
        write((data) => {
          data.quiz_starts.push({ id: randomUUID(), created_at: now(), source: null, ...row });
        }),
      listSince: (since) => read((data) => data.quiz_starts.filter((start) => start.created_at >= since)),
    },

    rateLimits: {
      consume: (key, windowStart, limit) =>
        write((data) => {
          if (limit <= 0) return false;
          const row = data.rate_limits.find((item) => item.key === key && item.window_start === windowStart);
          if (!row) {
            data.rate_limits.push({ key, window_start: windowStart, count: 1 });
            return true;
          }
          if (row.count >= limit) return false;
          row.count += 1;
          return true;
        }),
      deleteOlderThan: (isoDate) =>
        write((data) => {
          const before = data.rate_limits.length;
          data.rate_limits = data.rate_limits.filter((row) => row.window_start >= isoDate);
          return before - data.rate_limits.length;
        }),
    },
  };
}

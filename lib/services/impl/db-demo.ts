import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import demoShops from "../../../data/demo-shops.json" with { type: "json" };
import sampleProducts from "../../../data/sample-products.json" with { type: "json" };
import type {
  AiUsageRow,
  AllowedShopRow,
  ClickRow,
  ProductRow,
  PurchaseRow,
  QuizStartRow,
  RateLimitRow,
  ResultRow,
  SubscriberRow,
} from "../../db.ts";
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

function byCommissionDesc(a: ProductRow, b: ProductRow): number {
  return (b.commission_rate ?? -1) - (a.commission_rate ?? -1);
}

export function createDemoRepos(): Repos {
  return {
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
                ...row,
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
              product.updated_at = now();
            }
          }
        }),
      findCandidates: ({ minPrice, maxPrice, anyOfTags, noneOfTags, category, excludeIds, limit }) =>
        read((data) =>
          data.products
            .filter(
              (p) =>
                p.in_stock &&
                p.price_pln >= minPrice &&
                p.price_pln <= maxPrice &&
                (!anyOfTags?.length || p.tags.some((tag) => anyOfTags.includes(tag))) &&
                !(noneOfTags?.length && p.tags.some((tag) => noneOfTags.includes(tag))) &&
                (!category || p.category === category) &&
                !excludeIds?.includes(p.id),
            )
            .sort(byCommissionDesc)
            .slice(0, limit),
        ),
      saveDirect: (rows) =>
        write((data) => {
          const saved: ProductRow[] = [];
          for (const row of rows) {
            const existing = data.products.find((p) => p.network === "direct" && p.external_id === row.external_id);
            if (existing) {
              Object.assign(existing, row, { commission_rate: 0, in_stock: true, updated_at: now() });
              saved.push(existing);
              continue;
            }
            const product: ProductRow = {
              id: randomUUID(),
              ...row,
              network: "direct",
              commission_rate: 0,
              in_stock: true,
              updated_at: now(),
            };
            data.products.push(product);
            saved.push(product);
          }
          return saved;
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

/**
 * The catalog check: walks the products, checks each page politely and applies the rules. No AI, no web
 * search: nothing here may write to ai_usage. Portable (injected store, fetch and clock), so the same code runs in
 * the nightly GitHub Actions job (scripts/catalog-nightly.ts), in `npm run catalog:verify`, in the app (demo mode,
 * admin button) and in the tests.
 *
 * Rules (see decide()):
 *  - works                         -> status active, price and checked time updated, failed_checks = 0;
 *                                     a price move of more than 20 % goes to price_history;
 *  - "sold out" on the page        -> status out_of_stock at once (checked again later, it may come back);
 *  - 404 / 410 / redirect to the home page or a listing / redirect to another domain,
 *    timeout / 5xx / network error -> failed_checks + 1; after 2 in a row status broken;
 *  - blocked (401/403/429/451)     -> left as it is (the shop refuses robots, the product is not gone);
 *  - robots.txt forbids it         -> skipped (not an error);
 *  - no structured data on page    -> left as it is (not an error), shown in the admin panel.
 * Politeness: own User-Agent, robots.txt, at most 1 request per second to one domain, at most 5 requests at once.
 * Affiliate links are never opened: the product's own page (url) is checked, so no affiliate clicks are generated.
 */
import { checkUrl, fetchRobotsText, ROBOTS_TOKEN, type CheckDeps, type CheckOutcome } from "./check.ts";
import { parseRobots, type RobotsRules } from "./robots.ts";

export const PRICE_CHANGE_THRESHOLD = 0.2;
export const FAILED_CHECKS_LIMIT = 2;
export const MIN_INTERVAL_MS = 1_000;
export const MAX_RUN_MS = 20 * 60_000;
export const DEFAULT_CONCURRENCY = 5;

export type ProductStatus = "active" | "pending" | "out_of_stock" | "broken";

export type CheckProduct = {
  id: string;
  name: string;
  url: string | null;
  affiliate_url: string;
  price_pln: number;
  network: string;
  failed_checks: number;
  status: ProductStatus;
  last_check_at: string | null;
};

export type RunState = {
  id: string;
  started_at: string;
  total: number;
  processed: number;
  cursor: string | null;
  ok: number;
  price_changes: number;
  became_unavailable: number;
  skipped_robots: number;
  unverified: number;
  errors: number;
  failures: Record<string, Record<string, number>>;
};

export type ProductPatch = {
  price_pln?: number;
  price_checked?: number;
  checked_at?: string;
  in_stock?: boolean;
  status?: ProductStatus;
  final_url?: string;
  failed_checks: number;
  last_check_at: string;
  last_check_result: string;
};

export type CheckStore = {
  /** Products that may be checked (not broken, not demo). The runner decides the order. */
  listProducts(): Promise<CheckProduct[]>;
  listShopDomains(): Promise<string[]>;
  applyCheck(productId: string, patch: ProductPatch, history?: { old_price: number; new_price: number }): Promise<void>;
  getRun(id: string): Promise<RunState | null>;
  updateRun(id: string, patch: Partial<RunState> & { status?: "running" | "completed" | "partial" | "failed"; finished_at?: string | null }): Promise<void>;
};

export type Decision = {
  patch: ProductPatch;
  history?: { old_price: number; new_price: number };
  counters: Partial<Record<"ok" | "price_changes" | "became_unavailable" | "unverified" | "errors", number>>;
  /** For the per-shop error table. */
  failure?: string;
};

/** The rules above, as a pure function (tested without any network). */
export function decide(product: CheckProduct, outcome: CheckOutcome, nowIso: string): Decision {
  const base = { last_check_at: nowIso };
  const wasAvailable = product.status === "active" || product.status === "pending";
  switch (outcome.kind) {
    case "ok": {
      const live = { ...base, checked_at: nowIso, status: "active" as const, in_stock: true, failed_checks: 0, final_url: outcome.finalUrl };
      const price = outcome.price;
      if (price === null) return { patch: { ...live, last_check_result: "ok" }, counters: { ok: 1 } };
      const old = product.price_pln;
      const moved = old > 0 ? Math.abs(price - old) / old > PRICE_CHANGE_THRESHOLD : price !== old;
      return {
        patch: { ...live, price_pln: price, price_checked: price, last_check_result: moved ? "price_changed" : "ok" },
        history: moved ? { old_price: old, new_price: price } : undefined,
        counters: moved ? { ok: 1, price_changes: 1 } : { ok: 1 },
      };
    }
    case "sold_out":
      return {
        patch: { ...base, status: "out_of_stock", in_stock: false, failed_checks: 0, last_check_result: "out_of_stock" },
        counters: wasAvailable ? { became_unavailable: 1 } : {},
      };
    case "gone":
    case "error": {
      if (outcome.kind === "error" && outcome.reason === "blocked") {
        // The shop refuses robots: we cannot tell, so nothing changes. It still shows up per shop in the admin panel.
        return {
          patch: { ...base, failed_checks: product.failed_checks, last_check_result: "unverified_blocked" },
          counters: { unverified: 1 },
          failure: "blocked",
        };
      }
      const failed = product.failed_checks + 1;
      const broken = failed >= FAILED_CHECKS_LIMIT;
      const label = outcome.kind === "gone" ? `gone_${outcome.reason}` : `error_${outcome.reason}`;
      return {
        patch: { ...base, failed_checks: failed, ...(broken ? { status: "broken" as const, in_stock: false } : {}), last_check_result: label },
        counters: { errors: 1, ...(broken && wasAvailable ? { became_unavailable: 1 } : {}) },
        failure: outcome.reason,
      };
    }
    case "unverified":
      return { patch: { ...base, failed_checks: product.failed_checks, last_check_result: `unverified_${outcome.reason}` }, counters: { unverified: 1 } };
  }
}

export type RunnerOptions = {
  runId: string;
  /** Soft limit of this invocation; when it is used up the run stops and can be resumed from the cursor. */
  budgetMs: number;
  /** Hard limit of the whole run, measured from run.started_at. */
  maxRunMs?: number;
  deps: CheckDeps;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  /** Requests at the same time (to different domains); default 5. */
  concurrency?: number;
  /** At most this many products in this run. */
  limit?: number;
  /** Only products not checked for this many days (or never), oldest first. Without it: all, in id order, resumable. */
  staleAfterDays?: number;
  /** Tests only: allow http:// addresses (a local test server). Production checks https only. */
  allowInsecure?: boolean;
  log?: (message: string) => void;
};

export type RunnerResult = { status: "completed" | "partial" | "paused"; processed: number };

const hostOf = (url: string) => new URL(url).hostname.toLowerCase();
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The products of this run, in order: oldest check first (stale mode) or by id after the cursor (full mode). */
export function selectProducts(
  products: CheckProduct[],
  options: { cursor: string | null; limit?: number; staleAfterDays?: number; now: number },
): CheckProduct[] {
  let list: CheckProduct[];
  if (options.staleAfterDays !== undefined) {
    const cutoff = options.now - options.staleAfterDays * 86_400_000;
    const checkedAt = (product: CheckProduct) => (product.last_check_at ? Date.parse(product.last_check_at) : 0);
    list = products.filter((product) => checkedAt(product) < cutoff).sort((a, b) => checkedAt(a) - checkedAt(b) || byId(a, b));
  } else {
    list = [...products].sort(byId).filter((product) => options.cursor === null || product.id > options.cursor);
  }
  return options.limit !== undefined ? list.slice(0, options.limit) : list;
}

/**
 * Runs (or resumes) one check run. "paused" = the invocation budget ran out, call again to continue;
 * "partial" = the run's time limit ended it; "completed" = every selected product was looked at.
 */
export async function runCatalogCheck(store: CheckStore, options: RunnerOptions): Promise<RunnerResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = options.minIntervalMs ?? MIN_INTERVAL_MS;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const log = options.log ?? (() => {});
  const begun = now();

  const run = await store.getRun(options.runId);
  if (!run) throw new Error("Unknown check run");
  const runStarted = Date.parse(run.started_at);
  const maxRunMs = options.maxRunMs ?? MAX_RUN_MS;

  const [products, domains] = await Promise.all([store.listProducts(), store.listShopDomains()]);
  const queue = selectProducts(products, { cursor: run.cursor, limit: options.limit, staleAfterDays: options.staleAfterDays, now: now() });

  // At most one request per second to one domain, also with several workers: the requests of one domain wait in a
  // queue, and each one starts at least `interval` after the previous one actually started.
  const lanes = new Map<string, Promise<void>>();
  const lastStart = new Map<string, number>();
  const waitForTurn = (url: string): Promise<void> => {
    const host = hostOf(url);
    const turn = (lanes.get(host) ?? Promise.resolve()).then(async () => {
      const wait = (lastStart.get(host) ?? Number.NEGATIVE_INFINITY) + interval - now();
      if (wait > 0) await sleep(wait);
      lastStart.set(host, now());
    });
    lanes.set(host, turn);
    return turn;
  };

  const state: RunState = { ...run, total: run.total || queue.length, failures: JSON.parse(JSON.stringify(run.failures ?? {})) };
  const robots = new Map<string, Promise<RobotsRules>>();
  const robotsFor = (url: string, deps: CheckDeps) => {
    const host = hostOf(url);
    let rules = robots.get(host);
    if (!rules) {
      rules = fetchRobotsText(new URL(url).origin, deps).then((text) => (text ? parseRobots(text, ROBOTS_TOKEN) : { isAllowed: () => true }));
      robots.set(host, rules);
    }
    return rules;
  };

  const save = (extra: Parameters<CheckStore["updateRun"]>[1] = {}) =>
    store.updateRun(state.id, {
      total: state.total,
      processed: state.processed,
      cursor: state.cursor,
      ok: state.ok,
      price_changes: state.price_changes,
      became_unavailable: state.became_unavailable,
      skipped_robots: state.skipped_robots,
      unverified: state.unverified,
      errors: state.errors,
      failures: state.failures,
      ...extra,
    });

  async function checkOne(product: CheckProduct): Promise<void> {
    const url = product.url ?? product.affiliate_url;
    const nowIso = new Date(now()).toISOString();
    let host: string | null = null;
    try {
      host = url && (options.allowInsecure ? /^https?:\/\//i : /^https:\/\//i).test(url) ? hostOf(url) : null;
    } catch {
      host = null;
    }
    if (!host || !url) {
      await store.applyCheck(product.id, { last_check_at: nowIso, failed_checks: product.failed_checks, last_check_result: "unverified_no_checkable_url" });
      state.unverified += 1;
      return;
    }
    // The product's own domain may always be read; redirects may stay on it or go to an allowed shop.
    const ownDomain = host.replace(/^www\./, "");
    const deps: CheckDeps = {
      ...options.deps,
      beforeRequest: waitForTurn,
      isAllowedHost: (candidate) => matches(candidate, ownDomain) || domains.some((domain) => matches(candidate, domain)),
    };

    const rules = await robotsFor(url, deps);
    const target = new URL(url);
    if (!rules.isAllowed(`${target.pathname}${target.search}`)) {
      await store.applyCheck(product.id, { last_check_at: nowIso, failed_checks: product.failed_checks, last_check_result: "skipped_robots" });
      state.skipped_robots += 1;
      return;
    }

    const outcome = await checkUrl(url, deps);
    const decision = decide(product, outcome, new Date(now()).toISOString());
    await store.applyCheck(product.id, decision.patch, decision.history);
    const counters = decision.counters;
    state.ok += counters.ok ?? 0;
    state.price_changes += counters.price_changes ?? 0;
    state.became_unavailable += counters.became_unavailable ?? 0;
    state.unverified += counters.unverified ?? 0;
    state.errors += counters.errors ?? 0;
    if (decision.failure) {
      state.failures[host] ??= {};
      state.failures[host][decision.failure] = (state.failures[host][decision.failure] ?? 0) + 1;
    }
    log(`${outcome.kind}${"reason" in outcome ? `:${outcome.reason}` : ""} ${host}`);
  }

  let result = "completed" as RunnerResult["status"];
  let next = 0;
  let sinceSave = 0;
  // The cursor (full mode) only moves past products that are finished, so a resumed run never skips one.
  const finished = new Array<boolean>(queue.length).fill(false);
  let prefix = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (result !== "completed") return;
      if (now() - runStarted > maxRunMs) {
        result = "partial";
        return;
      }
      if (now() - begun > options.budgetMs) {
        result = "paused";
        return;
      }
      const index = next++;
      if (index >= queue.length) return;
      await checkOne(queue[index]);
      finished[index] = true;
      while (prefix < queue.length && finished[prefix]) prefix++;
      if (prefix > 0) state.cursor = queue[prefix - 1].id;
      state.processed += 1;
      if (++sinceSave >= 10) {
        sinceSave = 0;
        await save();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, () => worker()));

  if (result === "paused") {
    await save();
  } else {
    await save({ status: result, finished_at: new Date(now()).toISOString() });
  }
  return { status: result, processed: state.processed };
}

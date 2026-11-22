/**
 * The weekly catalog check: walks the products, checks each page politely and applies the rules. No AI, no web
 * search: nothing here may write to ai_usage. Portable (injected store, fetch and clock), so the same code runs in
 * the Supabase Edge Function `check-links`, in the app (demo mode, admin button) and in scripts and tests.
 *
 * Rules (see decide()):
 *  - works and in stock          -> update price and checked_at; a move of more than 20 % goes to price_history;
 *  - 404 / 410 / redirect to a listing / "out of stock" -> in_stock = false at once;
 *  - timeout / 5xx / block / network -> failed_checks + 1, in_stock = false only after 2 in a row; a good check resets it;
 *  - robots.txt forbids it       -> skipped (not an error);
 *  - no structured data on page  -> left as it is (not an error), shown in the admin panel.
 * A price above the budget a product was recommended for is NOT handled here: the budget filters skip it.
 */
import { checkUrl, fetchRobotsText, ROBOTS_TOKEN, type CheckDeps, type CheckOutcome } from "./check.ts";
import { parseRobots, type RobotsRules } from "./robots.ts";

export const PRICE_CHANGE_THRESHOLD = 0.2;
export const FAILED_CHECKS_LIMIT = 2;
export const MIN_INTERVAL_MS = 1_000;
export const MAX_RUN_MS = 20 * 60_000;

export type CheckProduct = {
  id: string;
  name: string;
  url: string | null;
  affiliate_url: string;
  price_pln: number;
  network: string;
  failed_checks: number;
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
  checked_at?: string;
  in_stock?: boolean;
  failed_checks: number;
  last_check_at: string;
  last_check_result: string;
};

export type CheckStore = {
  /** Products to check, sorted by id. */
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
  switch (outcome.kind) {
    case "ok": {
      const price = outcome.price;
      if (price === null) {
        return { patch: { ...base, checked_at: nowIso, in_stock: true, failed_checks: 0, last_check_result: "ok" }, counters: { ok: 1 } };
      }
      const old = product.price_pln;
      const moved = old > 0 ? Math.abs(price - old) / old > PRICE_CHANGE_THRESHOLD : price !== old;
      return {
        patch: { ...base, price_pln: price, checked_at: nowIso, in_stock: true, failed_checks: 0, last_check_result: moved ? "price_changed" : "ok" },
        history: moved ? { old_price: old, new_price: price } : undefined,
        counters: moved ? { ok: 1, price_changes: 1 } : { ok: 1 },
      };
    }
    case "gone":
      return {
        patch: { ...base, in_stock: false, failed_checks: product.failed_checks, last_check_result: `gone_${outcome.reason}` },
        counters: { became_unavailable: 1 },
      };
    case "error": {
      // A block (401/403/429/451) means the shop refuses our bot, not that the product is gone: we cannot verify it,
      // so the product stays as it is. It still shows up per shop in the admin error table.
      if (outcome.reason === "blocked") {
        return {
          patch: { ...base, failed_checks: product.failed_checks, last_check_result: "unverified_blocked" },
          counters: { unverified: 1 },
          failure: "blocked",
        };
      }
      const failed = product.failed_checks + 1;
      const out = failed >= FAILED_CHECKS_LIMIT;
      return {
        patch: { ...base, failed_checks: failed, ...(out ? { in_stock: false } : {}), last_check_result: `error_${outcome.reason}` },
        counters: out ? { errors: 1, became_unavailable: 1 } : { errors: 1 },
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
  /** Tests only: allow http:// addresses (a local test server). Production checks https only. */
  allowInsecure?: boolean;
  log?: (message: string) => void;
};

export type RunnerResult = { status: "completed" | "partial" | "paused"; processed: number };

const hostOf = (url: string) => new URL(url).hostname.toLowerCase();
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Runs (or resumes) one check run. "paused" = the invocation budget ran out, call again to continue;
 * "partial" = the 20 minute limit ended the run; "completed" = every product was looked at.
 */
export async function runCatalogCheck(store: CheckStore, options: RunnerOptions): Promise<RunnerResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = options.minIntervalMs ?? MIN_INTERVAL_MS;
  const log = options.log ?? (() => {});
  const begun = now();

  const run = await store.getRun(options.runId);
  if (!run) throw new Error("Unknown check run");
  const runStarted = Date.parse(run.started_at);
  const maxRunMs = options.maxRunMs ?? MAX_RUN_MS;

  const [products, domains] = await Promise.all([store.listProducts(), store.listShopDomains()]);
  const isAllowedHost = (host: string) => domains.some((domain) => matches(host, domain));
  const lastRequest = new Map<string, number>();
  /** At most one request per second to one domain: applies to EVERY request, redirect hops and robots.txt included. */
  const throttledFetch: CheckDeps["fetch"] = async (url, init) => {
    const host = hostOf(url);
    const wait = (lastRequest.get(host) ?? 0) + interval - now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, now());
    return options.deps.fetch(url, init);
  };
  const deps: CheckDeps = { ...options.deps, fetch: throttledFetch, isAllowedHost };
  // The cursor is an id; the order must not depend on how the store sorts, so sort here (plain string order).
  const ordered = [...products].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pending = ordered.filter((product) => run.cursor === null || product.id > run.cursor);

  const state: RunState = { ...run, total: run.total || products.length, failures: JSON.parse(JSON.stringify(run.failures ?? {})) };
  const robots = new Map<string, RobotsRules>();

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

  let result: RunnerResult["status"] = "completed";
  let sinceSave = 0;

  for (const product of pending) {
    if (now() - runStarted > maxRunMs) {
      result = "partial";
      break;
    }
    if (now() - begun > options.budgetMs) {
      result = "paused";
      break;
    }

    const url = product.url ?? (product.network === "direct" ? product.affiliate_url : null);
    const nowIso = new Date(now()).toISOString();
    state.processed += 1;
    state.cursor = product.id;
    sinceSave += 1;

    // Only plain https addresses on an allowed shop (the product's own page; never an affiliate redirect).
    if (!url || !(options.allowInsecure ? /^https?:\/\//i : /^https:\/\//i).test(url) || !isAllowedHost(hostOf(url))) {
      await store.applyCheck(product.id, { last_check_at: nowIso, failed_checks: product.failed_checks, last_check_result: "unverified_no_checkable_url" });
      state.unverified += 1;
      continue;
    }

    const host = hostOf(url);
    let rules = robots.get(host);
    if (!rules) {
      const text = await fetchRobotsText(new URL(url).origin, deps);
      rules = text ? parseRobots(text, ROBOTS_TOKEN) : { isAllowed: () => true };
      robots.set(host, rules);
    }
    const target = new URL(url);
    if (!rules.isAllowed(`${target.pathname}${target.search}`)) {
      await store.applyCheck(product.id, { last_check_at: nowIso, failed_checks: product.failed_checks, last_check_result: "skipped_robots" });
      state.skipped_robots += 1;
      continue;
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

    if (sinceSave >= 10) {
      await save();
      sinceSave = 0;
    }
  }

  if (result === "paused") {
    await save();
  } else {
    await save({ status: result, finished_at: new Date(now()).toISOString() });
  }
  return { status: result, processed: state.processed };
}

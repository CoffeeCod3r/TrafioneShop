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
import { BACKED_OFF, checkUrl, type CheckDeps, type CheckOutcome } from "./check.ts";
import { DEFAULT_DOMAIN_RULE, DOMAIN_RULES, ruleFor, type DomainRule } from "./domains.ts";
import { createPolite } from "./polite.ts";

export const PRICE_CHANGE_THRESHOLD = 0.2;
export const FAILED_CHECKS_LIMIT = 2;
export const MIN_INTERVAL_MS = 1_000;
export const MAX_RUN_MS = 20 * 60_000;
export const DEFAULT_CONCURRENCY = 5;
/** After this many blocks in a row (401/403/429, CAPTCHA) a domain is left alone for the rest of the run. */
export const BLOCKS_BEFORE_BACKING_OFF = DEFAULT_DOMAIN_RULE.blocksBeforeBackOff;

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
  /** Per-domain politeness (lib/catalog-check/domains.ts); tests pass their own. */
  domainRules?: Record<string, Partial<DomainRule>>;
  /** Only these products (warm-up: the ones that would fill a combination). */
  onlyIds?: readonly string[];
  log?: (message: string) => void;
};

export type RunnerResult = { status: "completed" | "partial" | "paused"; processed: number };

const hostOf = (url: string) => new URL(url).hostname.toLowerCase();
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The products of this run, in order: oldest check first (stale mode) or by id after the cursor (full mode). */
export function selectProducts(
  products: CheckProduct[],
  options: {
    cursor: string | null;
    limit?: number;
    staleAfterDays?: number;
    now: number;
    domainRules?: Record<string, Partial<DomainRule>>;
    onlyIds?: readonly string[];
  },
): CheckProduct[] {
  let list: CheckProduct[];
  if (options.onlyIds) {
    const wanted = new Set(options.onlyIds);
    products = products.filter((product) => wanted.has(product.id));
  }
  if (options.staleAfterDays !== undefined) {
    const cutoff = options.now - options.staleAfterDays * 86_400_000;
    const checkedAt = (product: CheckProduct) => (product.last_check_at ? Date.parse(product.last_check_at) : 0);
    list = products.filter((product) => checkedAt(product) < cutoff).sort((a, b) => checkedAt(a) - checkedAt(b) || byId(a, b));
  } else {
    list = [...products].sort(byId).filter((product) => options.cursor === null || product.id > options.cursor);
  }
  // A domain with its own cap (Ceneo: 60 per run) gives up its later products to the next run.
  const taken = new Map<string, number>();
  list = list.filter((product) => {
    let host: string;
    try {
      host = hostOf(product.url ?? product.affiliate_url);
    } catch {
      return true;
    }
    const rule = ruleFor(host, options.domainRules ?? DOMAIN_RULES);
    const count = taken.get(rule.key) ?? 0;
    if (count >= rule.maxPerRun) return false;
    taken.set(rule.key, count + 1);
    return true;
  });
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
  const domainRules = options.domainRules ?? DOMAIN_RULES;
  const queue = selectProducts(products, { cursor: run.cursor, limit: options.limit, staleAfterDays: options.staleAfterDays, now: now(), domainRules, onlyIds: options.onlyIds });

  // Domains with their own rule (Ceneo) use its interval; every other domain uses the run's interval.
  const polite = createPolite({
    intervalMs: interval,
    intervalFor: (host) => {
      const rule = ruleFor(host, domainRules);
      return rule.key in domainRules ? rule.intervalMs : undefined;
    },
    now,
    sleep,
  });

  const state: RunState = { ...run, total: run.total || queue.length, failures: JSON.parse(JSON.stringify(run.failures ?? {})) };
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

  // Domains that started refusing us (blocks / CAPTCHA): we back off and do not ask again in this run.
  const blocksInRow = new Map<string, number>();
  const backedOff = new Set<string>();

  // One product at a time per domain (its redirects included), so a shop that starts blocking us gets no queued
  // requests after we back off. Different shops are still checked in parallel.
  const hostLocks = new Map<string, Promise<void>>();
  function hostKey(product: CheckProduct): string {
    try {
      return hostOf(product.url ?? product.affiliate_url);
    } catch {
      return "";
    }
  }
  function withHostLock(product: CheckProduct): Promise<void> {
    const key = hostKey(product);
    const run = (hostLocks.get(key) ?? Promise.resolve()).then(() => checkOne(product));
    hostLocks.set(key, run.catch(() => undefined));
    return run;
  }

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
    // Not touched at all when we backed off from the domain: last_check_at stays, the product is checked in a later run.
    const skipBackedOff = () => {
      state.failures[host!] ??= {};
      state.failures[host!].skipped_after_block = (state.failures[host!].skipped_after_block ?? 0) + 1;
    };
    if (backedOff.has(host)) return skipBackedOff();
    // The product's own domain may always be read; redirects may stay on it or go to an allowed shop.
    const ownDomain = host.replace(/^www\./, "");
    const deps: CheckDeps = {
      ...options.deps,
      // After waiting for its turn, a request to a domain we backed off from is not sent at all.
      beforeRequest: async (target) => {
        await polite.waitForTurn(target);
        if (backedOff.has(hostOf(target))) {
          const error = new Error("Backed off");
          error.name = BACKED_OFF;
          throw error;
        }
      },
      isAllowedHost: (candidate) => matches(candidate, ownDomain) || domains.some((domain) => matches(candidate, domain)),
    };

    if (!(await polite.allows(url, deps))) {
      await store.applyCheck(product.id, { last_check_at: nowIso, failed_checks: product.failed_checks, last_check_result: "skipped_robots" });
      state.skipped_robots += 1;
      return;
    }

    let outcome: CheckOutcome;
    try {
      outcome = await checkUrl(url, deps);
    } catch (error) {
      if (error instanceof Error && error.name === BACKED_OFF) return skipBackedOff();
      throw error;
    }
    if (outcome.kind === "error" && outcome.reason === "blocked") {
      const inRow = (blocksInRow.get(host) ?? 0) + 1;
      blocksInRow.set(host, inRow);
      if (inRow >= ruleFor(host, domainRules).blocksBeforeBackOff && !backedOff.has(host)) {
        backedOff.add(host);
        log(`backing off ${host} after ${inRow} blocks in a row`);
      }
    } else {
      blocksInRow.set(host, 0);
    }
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
      await withHostLock(queue[index]);
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

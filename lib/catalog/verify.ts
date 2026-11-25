/**
 * Link, price and availability verification of the product pool. NO AI: plain HTTP requests, the page read by
 * lib/catalog-check/extract.ts (schema.org JSON-LD Product/Offer first, then og:/product: price meta tags).
 * Portable (injected store, fetch and clock): used by `npm run catalog:verify`, the nightly job and the tests.
 *
 * Per product: GET with an 8 s timeout and a browser User-Agent, at most 3 redirects. A redirect to the home page, to a
 * listing or to another domain counts as a failure. Rules (see decide()):
 *   404 / 410 / redirect to the home page      -> fail_count + 1; the second failure in a row makes it `broken`
 *   timeout / 5xx / network error              -> the same (a good check resets the counter)
 *   availability OutOfStock                    -> `out_of_stock`
 *   price moved more than 20 %                 -> price updated, a row appended to price_history
 *   anything else that works                   -> `active`, fail_count 0, last_checked_at now
 *   blocked (401/403/429), no data on the page of a new AI-found product, other currency -> nothing changes
 *   (the product just keeps its old last_checked_at, so it leaves the pool after 7 days instead of being guessed at)
 * Affiliate links are never opened: the shop's own address is used (resolveTargetUrl), and a product whose target
 * cannot be determined is skipped. At most 5 requests at a time and 1 request per second per domain (robots.txt too);
 * robots.txt is respected.
 */
import { extractPageInfo, type Availability, type PageInfo } from "../catalog-check/extract.ts";
import { readCapped } from "../catalog-check/check.ts";
import { parseRobots, type RobotsRules } from "../catalog-check/robots.ts";

export const VERIFY_TIMEOUT_MS = 8_000;
export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 1_000_000;
export const CONCURRENCY = 5;
export const DOMAIN_INTERVAL_MS = 1_000;
export const FAIL_LIMIT = 2;
export const PRICE_CHANGE_THRESHOLD = 0.2;
/** Products last attempted more than this long ago (or with a failure on record) are "stale". */
export const STALE_AFTER_DAYS = 3;

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
/** robots.txt group we answer to; our browser User-Agent matches none, so the `*` group applies. */
const ROBOTS_TOKEN = "prezentoskop-verify";

export type VerifyProduct = {
  id: string;
  name: string;
  url: string | null;
  affiliate_url: string;
  network: string;
  price_pln: number;
  status: "active" | "out_of_stock" | "broken" | "pending";
  fail_count: number;
  source: "catalog_build" | "feed" | "manual";
};

export type VerifyPatch = {
  status?: VerifyProduct["status"];
  fail_count: number;
  /** Set only by a successful verification (it is what keeps the product in the pool). */
  last_checked_at?: string;
  price_pln?: number;
  price_checked?: number;
  /** Every attempt, whatever the outcome (selection of stale products). */
  last_check_at: string;
  last_check_result: string;
};

export type VerifyStore = {
  /** Candidates oldest attempt first (never attempted first); see CatalogRepo.listForVerify. */
  list(options: { onlyStale: boolean; staleBeforeIso: string; ids?: string[] }): Promise<VerifyProduct[]>;
  apply(productId: string, patch: VerifyPatch, history?: { old_price: number; new_price: number }): Promise<void>;
};

// ---------------------------------------------------------------------------
// Target address (never an affiliate network link)
// ---------------------------------------------------------------------------

/** Networks whose links lead straight to the shop's own page (Google Merchant Center feeds, web search results). */
const DIRECT_NETWORKS = new Set(["direct", "gmc"]);
const DEEPLINK_PARAMS = ["ued", "ulp", "murl", "url", "u", "dl", "deeplink", "redirect", "to"];

function asHttpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The shop's own product page: the plain `url` when there is one, the link itself for direct networks, otherwise the
 * address hidden in the affiliate link's deeplink parameter (e.g. Awin `ued=`). Null when it cannot be determined:
 * then nothing is opened (an affiliate link would register a click).
 */
export function resolveTargetUrl(product: Pick<VerifyProduct, "url" | "affiliate_url" | "network">): string | null {
  const plain = asHttpUrl(product.url);
  if (plain) return plain.toString();
  const link = asHttpUrl(product.affiliate_url);
  if (!link) return null;
  if (DIRECT_NETWORKS.has(product.network)) return link.toString();
  for (const name of DEEPLINK_PARAMS) {
    const target = asHttpUrl(link.searchParams.get(name));
    if (target && target.hostname !== link.hostname) return target.toString();
  }
  return null;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Same site: equal hosts, ignoring "www.", or one a subdomain of the other. */
export function sameSite(a: string, b: string): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

// ---------------------------------------------------------------------------
// Fetching one page
// ---------------------------------------------------------------------------

export type VerifyFetch = (url: string, init: { headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }) => Promise<Response>;

export type VerifyDeps = {
  fetch: VerifyFetch;
  timeoutMs?: number;
  maxBytes?: number;
};

export type PageResult =
  | { kind: "page"; status: number; finalUrl: string; redirected: boolean; html: string }
  | { kind: "off_domain"; to: string }
  | { kind: "too_many_redirects" };

async function request(url: string, deps: VerifyDeps, accept: string, maxBytes: number): Promise<{ response: Response; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? VERIFY_TIMEOUT_MS);
  try {
    const response = await deps.fetch(url, {
      headers: { "user-agent": BROWSER_USER_AGENT, accept, "accept-language": "pl-PL,pl;q=0.9,en;q=0.5" },
      redirect: "manual",
      signal: controller.signal,
    });
    const readable = response.status >= 200 && response.status < 300;
    const html = readable ? await readCapped(response, maxBytes) : "";
    if (!readable) await response.body?.cancel().catch(() => undefined);
    return { response, html };
  } finally {
    clearTimeout(timer);
  }
}

/** Follows up to 3 redirects, only inside the same site. Throws on timeout or network failure. */
export async function fetchProductPage(url: string, deps: VerifyDeps): Promise<PageResult> {
  const origin = new URL(url).hostname;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { response, html } = await request(current, deps, "text/html,application/xhtml+xml", deps.maxBytes ?? MAX_BODY_BYTES);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { kind: "page", status: response.status, finalUrl: current, redirected: hop > 0, html: "" };
      if (hop === MAX_REDIRECTS) return { kind: "too_many_redirects" };
      const next = new URL(location, current);
      if (!sameSite(next.hostname, origin)) return { kind: "off_domain", to: next.hostname };
      current = next.toString();
      continue;
    }
    return { kind: "page", status: response.status, finalUrl: current, redirected: hop > 0, html };
  }
  return { kind: "too_many_redirects" };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type VerifyOutcome =
  | { kind: "ok"; price: number | null; availability: Availability; source: PageInfo["source"] }
  | { kind: "out_of_stock" }
  | { kind: "failed"; reason: "http_404" | "http_410" | "redirect_to_home" | "redirect_off_domain" | "too_many_redirects" | "timeout" | "http_5xx" | "network" }
  | { kind: "unverified"; reason: "blocked" | "no_structured_data" | "currency" | "other_status" | "robots" | "no_url" };

function isHomePage(url: string): boolean {
  const path = new URL(url).pathname;
  return path === "/" || path === "";
}

/** A move from a product page to a shallower page without any product data (a category, a search) counts like the home page. */
function isListingRedirect(originalUrl: string, finalUrl: string, info: PageInfo): boolean {
  const from = new URL(originalUrl);
  const to = new URL(finalUrl);
  if (from.pathname === to.pathname) return false;
  if (isHomePage(finalUrl)) return true;
  const depth = (path: string) => path.split("/").filter(Boolean).length;
  return depth(to.pathname) < depth(from.pathname) && info.price === null;
}

/** What the page said, as one of the outcomes the rules work with. Pure. */
export function judge(originalUrl: string, result: PageResult): VerifyOutcome {
  if (result.kind === "off_domain") return { kind: "failed", reason: "redirect_off_domain" };
  if (result.kind === "too_many_redirects") return { kind: "failed", reason: "too_many_redirects" };
  const { status } = result;
  if (status === 404) return { kind: "failed", reason: "http_404" };
  if (status === 410) return { kind: "failed", reason: "http_410" };
  if (status === 401 || status === 403 || status === 429 || status === 451) return { kind: "unverified", reason: "blocked" };
  if (status >= 500) return { kind: "failed", reason: "http_5xx" };
  if (status < 200 || status >= 300) return { kind: "unverified", reason: "other_status" };

  const info = extractPageInfo(result.html);
  if (result.redirected && isListingRedirect(originalUrl, result.finalUrl, info)) {
    return { kind: "failed", reason: "redirect_to_home" };
  }
  if (info.availability === "out_of_stock") return { kind: "out_of_stock" };
  if (info.currency && info.currency !== "PLN") return { kind: "unverified", reason: "currency" };
  if (info.price !== null || info.availability === "in_stock") {
    return { kind: "ok", price: info.price, availability: info.availability, source: info.source };
  }
  return { kind: "unverified", reason: "no_structured_data" };
}

export type Decision = {
  patch: VerifyPatch;
  history?: { old_price: number; new_price: number };
  /** For the summary. */
  effect: "active" | "became_broken" | "became_out_of_stock" | "failed_once" | "unverified";
  priceChanged: boolean;
};

/** The rules from the header, as a pure function (tested without any network). */
export function decide(product: VerifyProduct, outcome: VerifyOutcome, nowIso: string): Decision {
  const attempt = { last_check_at: nowIso };
  switch (outcome.kind) {
    case "ok": {
      const price = outcome.price;
      const base: VerifyPatch = { ...attempt, status: "active", fail_count: 0, last_checked_at: nowIso, last_check_result: "ok" };
      if (price === null) return { patch: base, effect: "active", priceChanged: false };
      const old = product.price_pln;
      const moved = old > 0 ? Math.abs(price - old) / old > PRICE_CHANGE_THRESHOLD : price !== old;
      return {
        patch: { ...base, price_pln: price, price_checked: price, last_check_result: moved ? "price_changed" : "ok" },
        history: moved ? { old_price: old, new_price: price } : undefined,
        effect: "active",
        priceChanged: moved,
      };
    }
    case "out_of_stock":
      return {
        patch: { ...attempt, status: "out_of_stock", fail_count: 0, last_checked_at: nowIso, last_check_result: "out_of_stock" },
        effect: product.status === "out_of_stock" ? "unverified" : "became_out_of_stock",
        priceChanged: false,
      };
    case "failed": {
      const failCount = product.fail_count + 1;
      const broken = failCount >= FAIL_LIMIT;
      return {
        patch: { ...attempt, fail_count: failCount, ...(broken ? { status: "broken" as const } : {}), last_check_result: `failed_${outcome.reason}` },
        effect: broken ? (product.status === "broken" ? "unverified" : "became_broken") : "failed_once",
        priceChanged: false,
      };
    }
    case "unverified":
      // A page that loads but states no price still proves the link works for products that were verified before
      // (or came from a feed with its own price). A new AI-found product needs a price from the page to enter the pool.
      if (outcome.reason === "no_structured_data" && (product.status === "active" || product.source === "feed")) {
        return {
          patch: { ...attempt, status: "active", fail_count: 0, last_checked_at: nowIso, last_check_result: "ok_no_price_data" },
          effect: "active",
          priceChanged: false,
        };
      }
      return { patch: { ...attempt, fail_count: product.fail_count, last_check_result: `unverified_${outcome.reason}` }, effect: "unverified", priceChanged: false };
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type VerifyOptions = {
  deps: VerifyDeps;
  /** Only products last attempted more than 3 days ago (or with a failure on record). */
  onlyStale?: boolean;
  /** Verify only these products (e.g. the ones the nightly job just added). */
  ids?: string[];
  /** At most this many products are fetched. */
  limit?: number;
  /** Stop starting new products after this long (the rest waits for the next run). */
  maxMs?: number;
  concurrency?: number;
  intervalMs?: number;
  /** Tests only: allow http:// addresses (a local test server). Production checks https only. */
  allowInsecure?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
};

export type VerifySummary = {
  /** Products fetched and judged. */
  checked: number;
  active: number;
  broken: number;
  out_of_stock: number;
  failed_once: number;
  price_changes: number;
  /** Not judged: blocked, no data, other currency, robots.txt, no target address. */
  unverifiable: number;
  /** Products still waiting because the time limit ended the run. */
  remaining: number;
  /** { "shop.pl": { "timeout": 2 } } */
  failures: Record<string, Record<string, number>>;
};

export const emptySummary = (): VerifySummary => ({
  checked: 0,
  active: 0,
  broken: 0,
  out_of_stock: 0,
  failed_once: 0,
  price_changes: 0,
  unverifiable: 0,
  remaining: 0,
  failures: {},
});

type Job = { product: VerifyProduct; url: string; host: string };

/** Spreads the queue over domains, so concurrent workers are not all waiting for the same shop's 1 s slot. */
function interleaveByHost(jobs: Job[]): Job[] {
  const queues = new Map<string, Job[]>();
  for (const job of jobs) queues.set(job.host, [...(queues.get(job.host) ?? []), job]);
  const result: Job[] = [];
  for (let round = 0; result.length < jobs.length; round++) {
    for (const queue of queues.values()) if (round < queue.length) result.push(queue[round]);
  }
  return result;
}

export async function runVerify(store: VerifyStore, options: VerifyOptions): Promise<VerifySummary> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = options.intervalMs ?? DOMAIN_INTERVAL_MS;
  const log = options.log ?? (() => {});
  const started = now();
  const summary = emptySummary();
  const scheme = options.allowInsecure ? /^https?:\/\//i : /^https:\/\//i;

  const staleBeforeIso = new Date(now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const candidates = await store.list({ onlyStale: options.onlyStale ?? false, staleBeforeIso, ids: options.ids });

  // Resolve the shop address of each candidate; the ones without one are stamped (so they do not clog the queue) and skipped.
  const jobs: Job[] = [];
  for (const product of candidates) {
    if (options.limit !== undefined && jobs.length >= options.limit) break;
    const url = resolveTargetUrl(product);
    if (!url || !scheme.test(url)) {
      await store.apply(product.id, { fail_count: product.fail_count, last_check_at: new Date(now()).toISOString(), last_check_result: "unverified_no_checkable_url" });
      summary.unverifiable += 1;
      continue;
    }
    jobs.push({ product, url, host: new URL(url).hostname.toLowerCase() });
  }

  // 1 request per second per domain: a slot is reserved before the request, so concurrent workers queue up in order.
  const nextSlot = new Map<string, number>();
  const gate = async (host: string) => {
    const at = Math.max(now(), nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + interval);
    if (at > now()) await sleep(at - now());
  };
  const throttled: VerifyFetch = async (url, init) => {
    await gate(new URL(url).hostname.toLowerCase());
    return options.deps.fetch(url, init);
  };
  const deps: VerifyDeps = { ...options.deps, fetch: throttled };

  const robots = new Map<string, Promise<RobotsRules>>();
  const robotsFor = (url: string): Promise<RobotsRules> => {
    const origin = new URL(url).origin;
    let rules = robots.get(origin);
    if (!rules) {
      rules = (async () => {
        try {
          const { response, html } = await request(`${origin}/robots.txt`, deps, "text/plain,*/*;q=0.5", 200_000);
          return response.status >= 200 && response.status < 300 && html ? parseRobots(html, ROBOTS_TOKEN) : { isAllowed: () => true };
        } catch {
          return { isAllowed: () => true };
        }
      })();
      robots.set(origin, rules);
    }
    return rules;
  };

  const queue = interleaveByHost(jobs);
  let index = 0;
  let stopped = false;

  const verifyOne = async ({ product, url, host }: Job) => {
    let outcome: VerifyOutcome;
    const target = new URL(url);
    if (!(await robotsFor(url)).isAllowed(`${target.pathname}${target.search}`)) {
      outcome = { kind: "unverified", reason: "robots" };
    } else {
      try {
        outcome = judge(url, await fetchProductPage(url, deps));
      } catch (error) {
        const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
        outcome = { kind: "failed", reason: aborted ? "timeout" : "network" };
      }
    }
    const decision = decide(product, outcome, new Date(now()).toISOString());
    await store.apply(product.id, decision.patch, decision.history);

    if (outcome.kind === "unverified") summary.unverifiable += 1;
    else summary.checked += 1;
    if (decision.effect === "active") summary.active += 1;
    if (decision.effect === "became_broken") summary.broken += 1;
    if (decision.effect === "became_out_of_stock") summary.out_of_stock += 1;
    if (decision.effect === "failed_once") summary.failed_once += 1;
    if (decision.priceChanged) summary.price_changes += 1;
    if (outcome.kind === "failed" || (outcome.kind === "unverified" && outcome.reason === "blocked")) {
      const reason = outcome.reason;
      summary.failures[host] ??= {};
      summary.failures[host][reason] = (summary.failures[host][reason] ?? 0) + 1;
    }
    log(`${outcome.kind}${"reason" in outcome ? `:${outcome.reason}` : ""} ${host} -> ${decision.effect}`);
  };

  const worker = async () => {
    for (;;) {
      if (options.maxMs !== undefined && now() - started > options.maxMs) {
        stopped = true;
        return;
      }
      const job = queue[index++];
      if (!job) return;
      await verifyOne(job);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? CONCURRENCY }, worker));
  if (stopped) summary.remaining = Math.max(0, queue.length - index);
  return summary;
}

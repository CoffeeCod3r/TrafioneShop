/**
 * Polite check of ONE product page, without AI: robots.txt, timeout, size cap, status code, redirects,
 * price and availability from the page itself (lib/catalog-check/extract.ts).
 * Portable: `fetch` is injected, no Node-only or Next.js APIs.
 */
import { extractPageInfo, type Availability, type PageInfo } from "./extract.ts";
import { BlockedUrlError, isFetchableUrl } from "../net-guard.ts";

export const USER_AGENT = "Prezentoskop-LinkChecker/1.0 (+https://prezentoskop.pl/kontakt; kontakt@prezentoskop.pl)";
/** The product token robots.txt files can address. */
export const ROBOTS_TOKEN = "Prezentoskop-LinkChecker";
export const REQUEST_TIMEOUT_MS = 8_000;
export const MAX_BODY_BYTES = 1_000_000;
/** Error name thrown by CheckDeps.beforeRequest when the run stopped asking a domain; checkUrl rethrows it. */
export const BACKED_OFF = "BackedOffError";
const MAX_REDIRECTS = 3;

export type FetchLike = (url: string, init: { headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }) => Promise<Response>;

export type CheckDeps = {
  fetch: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  /** Hostnames we may follow redirects to (the allowed shops); a redirect elsewhere is not followed. */
  isAllowedHost: (hostname: string) => boolean;
  /** Waits for this request's turn (per-domain politeness); awaited BEFORE the timeout starts counting. */
  beforeRequest?: (url: string) => Promise<void>;
  /** Tests only: allow http and private hosts (a local test server). Otherwise only public https URLs are fetched. */
  allowLocalHosts?: boolean;
};

export type FetchedPage = {
  status: number;
  /** Final address after the redirects we followed. */
  finalUrl: string;
  redirected: boolean;
  /** Up to maxBytes of the body (as text); empty for non-HTML or error answers. */
  html: string;
  /** A redirect pointed outside the allowed hosts and was not followed. */
  offSite: boolean;
};

export type CheckOutcome =
  | { kind: "ok"; price: number | null; availability: Availability; source: PageInfo["source"]; finalUrl: string }
  /** The product is gone: 404/410, a redirect to the home page / a listing, or a redirect to another domain. */
  | { kind: "gone"; reason: "http_404" | "http_410" | "redirect_to_listing" | "redirect_off_site" }
  /** The page says the product is sold out. */
  | { kind: "sold_out" }
  | { kind: "error"; reason: "timeout" | "http_5xx" | "blocked" | "network" }
  | { kind: "unverified"; reason: "no_structured_data" | "other_status" | "currency" };

/** Reads the body as text, stopping after maxBytes. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, bytes.length - offset));
    bytes.set(slice, offset);
    offset += slice.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** One request with a hard timeout that also covers reading the body. Throws an AbortError on timeout. */
async function request(url: string, deps: CheckDeps, kind: "page" | "robots"): Promise<{ response: Response; html: string }> {
  // SSRF guard: every request, including each redirect hop and robots.txt, goes through here.
  if (!isFetchableUrl(url, deps.allowLocalHosts)) throw new BlockedUrlError();
  await deps.beforeRequest?.(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await deps.fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: kind === "page" ? "text/html,application/xhtml+xml" : "text/plain,*/*;q=0.5", "accept-language": "pl-PL,pl;q=0.9" },
      redirect: "manual",
      signal: controller.signal,
    });
    const isHtml = (response.headers.get("content-type") ?? "").toLowerCase().includes("html");
    const readable = response.status >= 200 && response.status < 300 && (kind === "robots" || isHtml);
    const html = readable ? await readCapped(response, deps.maxBytes ?? MAX_BODY_BYTES) : "";
    if (!readable) await response.body?.cancel().catch(() => undefined);
    return { response, html };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches a product page, following up to 3 redirects inside the allowed hosts. */
export async function fetchPage(url: string, deps: CheckDeps): Promise<FetchedPage> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { response, html } = await request(current, deps, "page");
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: response.status, finalUrl: current, redirected: hop > 0, html: "", offSite: false };
      const next = new URL(location, current);
      if (!deps.isAllowedHost(next.hostname.toLowerCase())) return { status: response.status, finalUrl: current, redirected: hop > 0, html: "", offSite: true };
      current = next.toString();
      continue;
    }
    return { status: response.status, finalUrl: current, redirected: hop > 0, html, offSite: false };
  }
  // Redirect loop: treated like a block (nothing to learn from the page).
  return { status: 429, finalUrl: current, redirected: true, html: "", offSite: false };
}

/** The robots.txt of a host as text; null when there is none or it cannot be read (then everything is allowed). */
export async function fetchRobotsText(origin: string, deps: CheckDeps): Promise<string | null> {
  try {
    const { response, html } = await request(`${origin}/robots.txt`, { ...deps, maxBytes: 200_000 }, "robots");
    if (response.status < 200 || response.status >= 300) return null;
    return html || null;
  } catch {
    return null;
  }
}

function pathDepth(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

/** A redirect from a product page to the home page or to something shallower without product data. */
export function isListingRedirect(originalUrl: string, finalUrl: string, info: PageInfo): boolean {
  const from = new URL(originalUrl);
  const to = new URL(finalUrl);
  if (from.pathname === to.pathname) return false;
  if (to.pathname === "/" || to.pathname === "") return true;
  return pathDepth(to.pathname) < pathDepth(from.pathname) && info.price === null;
}

/** A redirect target that is a CAPTCHA or bot challenge page (e.g. Ceneo's /Captcha/Add, Cloudflare's /cdn-cgi/). */
export function isChallengeUrl(url: string): boolean {
  const { pathname } = new URL(url);
  return /captcha|challenge|\/cdn-cgi\/|\/robot-check|\/bot-?check/i.test(pathname);
}

/** Turns what the page said into one of the outcomes the rules work with. */
export function classify(originalUrl: string, page: FetchedPage): CheckOutcome {
  if (page.offSite) return { kind: "gone", reason: "redirect_off_site" };
  const { status } = page;
  if (status === 404) return { kind: "gone", reason: "http_404" };
  if (status === 410) return { kind: "gone", reason: "http_410" };
  if (status === 401 || status === 403 || status === 429 || status === 451) return { kind: "error", reason: "blocked" };
  if (status >= 500) return { kind: "error", reason: "http_5xx" };
  if (status < 200 || status >= 300) return { kind: "unverified", reason: "other_status" };

  // The shop sent us to a CAPTCHA / bot challenge: it refuses robots right now. Never solved or bypassed.
  if (page.redirected && isChallengeUrl(page.finalUrl)) return { kind: "error", reason: "blocked" };
  const info = extractPageInfo(page.html);
  if (page.redirected && isListingRedirect(originalUrl, page.finalUrl, info)) return { kind: "gone", reason: "redirect_to_listing" };
  if (info.availability === "out_of_stock") return { kind: "sold_out" };
  if (info.currency && info.currency !== "PLN") return { kind: "unverified", reason: "currency" };
  if (info.price !== null || info.availability === "in_stock") {
    return { kind: "ok", price: info.price, availability: info.availability, source: info.source, finalUrl: page.finalUrl };
  }
  return { kind: "unverified", reason: "no_structured_data" };
}

/** Fetches and classifies. Network failures and timeouts become "error" outcomes, never exceptions. */
export async function checkUrl(url: string, deps: CheckDeps): Promise<CheckOutcome> {
  try {
    return classify(url, await fetchPage(url, deps));
  } catch (error) {
    // The run decided to leave this domain alone (it started blocking us): not an outcome of the page.
    if (error instanceof Error && error.name === BACKED_OFF) throw error;
    const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return { kind: "error", reason: aborted ? "timeout" : "network" };
  }
}

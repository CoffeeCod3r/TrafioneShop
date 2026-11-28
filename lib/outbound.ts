/**
 * Which outbound URLs /go may redirect to. The URL always comes from our database (never from the request);
 * this is the second line of defence in case a bad URL ever got stored (feed, AI, manual edit).
 */

/** Affiliate network and price-comparison hosts our stored links point to. Extend with AFFILIATE_NETWORK_DOMAINS. */
export const DEFAULT_AFFILIATE_DOMAINS = ["awin1.com", "tradedoubler.com", "webep1.com", "ceneo.pl"] as const;

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase().replace(/^\*\./, ""))
    .filter((item) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(item));
}

/** Network domains from the defaults plus the AFFILIATE_NETWORK_DOMAINS env var (comma or space separated). */
export function affiliateNetworkDomains(env: string | undefined = process.env.AFFILIATE_NETWORK_DOMAINS): string[] {
  return [...new Set([...DEFAULT_AFFILIATE_DOMAINS, ...parseList(env)])];
}

export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Returns the absolute URL to redirect to, or null when it is not allowed:
 * - same-origin paths (demo products: "/demo-produkt/…"), never "//…" or "/\…";
 * - https URLs whose host is an allowed shop or an affiliate network.
 */
export function safeOutboundUrl(destination: string, requestUrl: string, allowedDomains: readonly string[]): URL | null {
  const value = destination.trim();
  if (!value) return null;
  const own = new URL(requestUrl);

  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.startsWith("/\\")) return null;
    const local = new URL(value, own);
    return local.origin === own.origin ? local : null;
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" || target.username || target.password) return null;
  const host = target.hostname.toLowerCase();
  return allowedDomains.some((domain) => hostMatches(host, domain.toLowerCase())) ? target : null;
}


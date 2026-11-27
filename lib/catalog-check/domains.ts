/**
 * Per-domain politeness for the pool check. Most shops: 1 request per second, back off after 3 blocks in a row.
 * Ceneo shows a CAPTCHA after about 50 quick requests, so it gets its own, much slower rules (agreed 27.11.2026):
 * 1 request per 15 s, at most 60 products per run, back off at the first block. Its checks stay valid for 21 days
 * (a full round of ~900 products takes about 15 nights), see FRESH_DAYS_BY_NETWORK in lib/catalog-build/coverage.ts.
 * Portable (no imports).
 */
export type DomainRule = {
  /** Minimum time between two requests to the domain. */
  intervalMs: number;
  /** At most this many products of the domain in one run (the oldest checks first). */
  maxPerRun: number;
  /** Back off from the domain for the rest of the run after this many blocks / CAPTCHAs in a row. */
  blocksBeforeBackOff: number;
};

export const DEFAULT_DOMAIN_RULE: DomainRule = { intervalMs: 1_000, maxPerRun: Number.POSITIVE_INFINITY, blocksBeforeBackOff: 3 };

/** Keyed by registrable domain; also applies to its subdomains (www.ceneo.pl). */
export const DOMAIN_RULES: Record<string, Partial<DomainRule>> = {
  "ceneo.pl": { intervalMs: 15_000, maxPerRun: 60, blocksBeforeBackOff: 1 },
};

export function ruleFor(host: string, rules: Record<string, Partial<DomainRule>> = DOMAIN_RULES): DomainRule & { key: string } {
  const lower = host.toLowerCase();
  for (const [domain, rule] of Object.entries(rules)) {
    if (lower === domain || lower.endsWith(`.${domain}`)) return { ...DEFAULT_DOMAIN_RULE, ...rule, key: domain };
  }
  return { ...DEFAULT_DOMAIN_RULE, key: lower };
}

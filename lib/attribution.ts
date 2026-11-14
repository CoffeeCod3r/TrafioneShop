/**
 * Traffic source of a visit, stored in results.source and quiz_starts.source:
 * - utm_source from the URL (e.g. "tiktok_film12"), or
 * - "ref:<ref_code>" when the visitor came from a shared result (?ref=).
 * Carried in the URL (home → /quiz), so no cookies or storage are needed.
 */
export const SOURCE_PATTERN = /^[a-z0-9_:.-]{1,80}$/;
const REF_PATTERN = /^[23456789A-Z]{7}$/;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function get(params: Params, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return typeof value === "string" ? value : null;
}

export function sourceFromParams(params: Params): string | null {
  const utm = get(params, "utm_source");
  if (utm) {
    const clean = utm.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 64);
    if (clean && SOURCE_PATTERN.test(clean)) return clean;
  }
  const ref = get(params, "ref")?.trim().toUpperCase();
  if (ref && REF_PATTERN.test(ref)) return `ref:${ref.toLowerCase()}`;
  return null;
}

export function isValidSource(value: unknown): value is string {
  return typeof value === "string" && SOURCE_PATTERN.test(value);
}

/** Query string that carries the source to the next page ("?utm_source=…" or "?ref=…"). */
export function sourceQuery(source: string | null): string {
  if (!source) return "";
  if (source.startsWith("ref:")) return `?ref=${source.slice(4).toUpperCase()}`;
  return `?utm_source=${encodeURIComponent(source)}`;
}

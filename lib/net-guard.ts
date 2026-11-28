/**
 * SSRF guard for server-side fetches of shop pages (catalog check, nightly top-up, warm-up).
 * Only https to public hostnames; literal private, loopback, link-local and metadata addresses are refused.
 * (Hostnames are checked as written; the shops come from allowed_shops, so DNS tricks need a hostile allowed shop.)
 */

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".").map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

/** True for hostnames that point at this machine or a private network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const v4 = ipv4Parts(host);
  if (v4) return isPrivateIpv4(v4);
  if (host.includes(":")) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), IPv4-mapped.
    if (host === "::1" || host === "::") return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
    if (mapped) return isPrivateIpv4(ipv4Parts(mapped[1]) ?? [0]);
    if (host.startsWith("::ffff:")) return true;
    return false;
  }
  // Bare numbers ("2130706433") and hex/octal forms are other spellings of IPv4 addresses.
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/.test(host)) return true;
  return false;
}

/**
 * May the server fetch this URL? https and a public host. `allowLocal` (tests with a server on 127.0.0.1 only)
 * also accepts http and private hosts.
 */
export function isFetchableUrl(url: string, allowLocal = false): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (allowLocal) return parsed.protocol === "https:" || parsed.protocol === "http:";
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  return !isPrivateHost(parsed.hostname);
}

export class BlockedUrlError extends Error {
  constructor() {
    super("URL not allowed (not https or a private address)");
    this.name = "BlockedUrlError";
  }
}

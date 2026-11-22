import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** (The /demo-* pages exist only in MOCK_MODE and are not listed here, so the file shows no test traces.)
 * Everything public may be crawled; personal results, admin, API and outbound-link redirects may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/wynik", "/admin", "/api", "/go/", "/pakiet/", "/zapis/", "/wypisz"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

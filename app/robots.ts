import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Everything public may be crawled; personal results, admin, API and outbound-link redirects may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/wynik", "/admin", "/api", "/go/", "/pakiet/", "/zapis/", "/wypisz", "/demo-checkout", "/demo-produkt"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

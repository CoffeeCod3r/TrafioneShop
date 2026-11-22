import type { MetadataRoute } from "next";

import { GUIDES, GUIDES_PUBLISHED } from "@/lib/guides/data";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Public, indexable pages: the home page, the quiz, the legal pages, the guides hub and every guide. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/quiz`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/poradniki`, lastModified: GUIDES_PUBLISHED, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((guide) => ({
      url: `${SITE_URL}/poradniki/${guide.slug}`,
      lastModified: GUIDES_PUBLISHED,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/o-nas`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/jak-zarabiamy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/kontakt`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/regulamin`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/prywatnosc`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

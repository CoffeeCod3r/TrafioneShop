import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/og/brand";

/** Web app manifest: name, colors and icons in the brand style. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prezentoskop",
    short_name: "Prezentoskop",
    description: "Trafione prezenty w 60 sekund: quiz, AI i prawdziwe produkty z polskich sklepów.",
    lang: "pl",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.paper,
    theme_color: BRAND.ribbon,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

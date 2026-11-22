import { OG_SIZE, ogImage } from "@/lib/og/brand";

export const alt = "Prezentoskop: trafione prezenty w 60 sekund";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Default share image of the site (home page and every page without its own image). */
export default function OpenGraphImage() {
  return ogImage("Trafione prezenty w 60 sekund", "Quiz, AI i prawdziwe produkty z polskich sklepów");
}

import { iconImage } from "@/lib/og/brand";

/** Browsers still ask for /favicon.ico; a small PNG of the logo mark answers (they accept PNG data here). */
export function GET() {
  return iconImage(48, 0.04);
}

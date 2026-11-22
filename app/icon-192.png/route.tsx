import { iconImage } from "@/lib/og/brand";

/** App icon 192x192 (web app manifest). */
export function GET() {
  return iconImage(192);
}

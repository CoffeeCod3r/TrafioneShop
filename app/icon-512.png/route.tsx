import { iconImage } from "@/lib/og/brand";

/** App icon 512x512 (web app manifest). */
export function GET() {
  return iconImage(512);
}

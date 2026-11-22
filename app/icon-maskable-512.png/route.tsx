import { iconImage } from "@/lib/og/brand";

/** Maskable app icon: the mark sits inside the safe zone, so Android can crop it to any shape. */
export function GET() {
  return iconImage(512, 0.22);
}

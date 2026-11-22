import { iconImage } from "@/lib/og/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon (iOS): the logo mark on blush paper. */
export default function AppleIcon() {
  return iconImage(180, 0.1);
}

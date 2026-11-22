import { OG_SIZE, ogImage } from "@/lib/og/brand";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Poradniki prezentowe Prezentoskopu";

/** Share image of the guides hub. */
export default function GuidesOpenGraphImage() {
  return ogImage("Poradniki prezentowe", "Pomysły na prezent na każdą okazję");
}

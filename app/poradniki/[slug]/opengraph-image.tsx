import { getGuide, GUIDES } from "@/lib/guides/data";
import { OG_SIZE, ogImage } from "@/lib/og/brand";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Poradnik prezentowy Prezentoskopu";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

/** Share image of a guide: its title on the brand background. */
export default async function GuideOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  return ogImage(guide?.h1 ?? "Poradniki prezentowe", "Poradnik prezentowy");
}

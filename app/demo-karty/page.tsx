import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCard, type ProductCardData } from "@/components/products/product-card";
import { ILLUSTRATION_CATEGORIES } from "@/lib/illustrations";
import { isMockMode } from "@/lib/mode";

export const metadata: Metadata = { title: "Karty produktów – demo", robots: { index: false } };

const base: Omit<ProductCardData, "name" | "category" | "photoUrl"> = {
  pricePln: 129,
  checkedAt: "2026-11-22T08:00:00.000Z",
  shop: "Sklep przykładowy",
  reason: "Pasuje do zainteresowań odbiorcy i mieści się w budżecie.",
  href: "/demo-produkt/przyklad",
};

/** Every card variant in one place (MOCK_MODE only): one per illustrated category, an unknown category, a feed photo. */
export default function DemoCardsPage() {
  if (!isMockMode()) notFound();
  const cards: ProductCardData[] = [
    ...ILLUSTRATION_CATEGORIES.map((category) => ({ ...base, name: `Przykładowy produkt: ${category}`, category, photoUrl: null })),
    { ...base, name: "Produkt z nieznanej kategorii (ilustracja ogólna)", category: "zupelnie-nowa", photoUrl: null },
    { ...base, name: "Produkt bez kategorii", category: null, photoUrl: null },
    {
      ...base,
      name: "Produkt z partnerskiego feedu, bardzo długa nazwa, która nie zmieści się w dwóch liniach i zostanie skrócona",
      category: "dom",
      photoUrl: "/illustrations/dom.svg",
    },
  ];
  return (
    <div className="flex flex-col gap-4 py-6">
      <h1 className="text-2xl font-bold">Karty produktów (demo)</h1>
      <ul className="flex flex-col gap-4" data-testid="cards">
        {cards.map((card) => (
          <ProductCard key={card.name} card={card} />
        ))}
      </ul>
    </div>
  );
}

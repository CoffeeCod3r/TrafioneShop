import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import demoWebPicks from "@/data/demo-web-picks.json";
import { isMockMode } from "@/lib/mode";
import { getRepos } from "@/lib/services/db";

export const metadata: Metadata = { title: "Produkt demo – Prezentownik AI", robots: { index: false } };

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

type PageProps = { params: Promise<{ id: string }> };

/** Fake shop page that demo product links point to. Exists only in MOCK_MODE. */
export default function DemoProductPage(props: PageProps) {
  if (!isMockMode()) notFound();
  return (
    <Suspense fallback={null}>
      <DemoProduct {...props} />
    </Suspense>
  );
}

async function DemoProduct({ params }: PageProps) {
  const { id } = await params;
  const web = demoWebPicks.find((pick) => pick.id === id);
  const product = web
    ? { name: web.title, price: web.price_pln, shop: web.shop_name, image: web.image_url, description: web.reason }
    : await getRepos()
        .products.getById(id)
        .then((row) =>
          row ? { name: row.name, price: row.price_pln, shop: row.merchant, image: row.image_url, description: row.description } : null,
        );
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-5 py-8">
      <p className="rounded-lg bg-yellow-100 p-3 text-sm text-yellow-900">
        To przykładowa strona sklepu z trybu demo. W prawdziwej wersji link prowadzi do sklepu partnerskiego.
      </p>
      {product.image && (
        <Image
          src={product.image}
          alt={product.name}
          width={400}
          height={400}
          unoptimized
          className="mx-auto w-full max-w-sm rounded-xl"
        />
      )}
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-2xl font-bold">{pln.format(product.price)}</p>
      <p className="text-muted-foreground">Sklep: {product.shop}</p>
      {product.description && <p>{product.description}</p>}
    </div>
  );
}

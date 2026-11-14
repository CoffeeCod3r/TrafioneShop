import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Info, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CHILD_PHOTO_NOTICE } from "@/lib/analyze/schema";
import { getResultView } from "@/lib/results";

export const metadata: Metadata = {
  title: "Twoje prezenty – Prezentownik AI",
  // Results are personal: keep them out of search engines.
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const price = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ResultPage(props: PageProps) {
  return (
    <Suspense fallback={<ResultSkeleton />}>
      <ResultContent {...props} />
    </Suspense>
  );
}

async function ResultContent({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [view, query] = await Promise.all([getResultView(id), searchParams]);
  if (!view) notFound();
  const photoSkipped = query.zdjecie === "pominiete";

  return (
    <div className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="size-4" aria-hidden />
          Profil prezentowy
        </p>
        <h1 className="text-2xl font-bold leading-tight">Twoje 5 trafionych prezentów</h1>
        {view.result.style_profile && <p className="text-lg">{view.result.style_profile}</p>}
      </header>

      {photoSkipped && (
        <p className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {CHILD_PHOTO_NOTICE}.
        </p>
      )}

      <section aria-labelledby="partner-picks" className="flex flex-col gap-4">
        <h2 id="partner-picks" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Z naszych sklepów partnerskich
        </h2>

        {view.products.length === 0 ? (
          <p className="rounded-xl border p-4">
            Nie znaleźliśmy pasujących produktów w tym budżecie. Spróbuj z innym budżetem lub zainteresowaniami.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {view.products.map((product, index) => (
              <li key={product.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex gap-4 p-4">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {product.image_url && (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        sizes="96px"
                        unoptimized
                        className="object-cover"
                      />
                    )}
                    <span className="absolute left-1 top-1 rounded-full bg-background/90 px-2 text-xs font-bold">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="line-clamp-2 font-semibold leading-snug">{product.name}</h3>
                    <p className="text-lg font-bold">{price.format(product.price_pln)}</p>
                    <p className="text-sm text-muted-foreground">{product.merchant}</p>
                  </div>
                </div>
                {product.reason && <p className="px-4 pb-3 text-sm">{product.reason}</p>}
                <div className="px-4 pb-4">
                  {product.in_stock ? (
                    <Button asChild size="xl" className="w-full">
                      <a href={product.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">
                        Zobacz w sklepie
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground">Produkt jest chwilowo niedostępny.</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Linki do sklepów są linkami partnerskimi: jeśli coś kupisz, możemy dostać prowizję. Cena dla Ciebie się nie
        zmienia.
      </p>

      <Button asChild variant="outline" size="xl">
        <Link href="/quiz">
          <RotateCcw aria-hidden />
          Szukaj od nowa
        </Link>
      </Button>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 py-6" aria-busy="true" aria-label="Wczytywanie wyników">
      <div className="h-8 w-3/4 rounded bg-muted" />
      <div className="h-16 rounded bg-muted" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-40 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

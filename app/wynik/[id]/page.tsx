import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info, RotateCcw, Sparkles } from "lucide-react";

import { ResultTracker } from "@/components/analytics/result-tracker";
import { GiftStack } from "@/components/illustrations/gift-stack";
import { BestMatch } from "@/components/results/best-match";
import { FreeSearchProgress } from "@/components/results/free-search-progress";
import { PackInfo } from "@/components/results/pack-info";
import { PaidSearchSection } from "@/components/results/paid-search-section";
import { fromResultProduct } from "@/components/products/adapters";
import { ProductCard } from "@/components/products/product-card";
import { ShareButton } from "@/components/results/share-button";
import { SubscribeForm } from "@/components/subscribe/subscribe-form";
import { Button } from "@/components/ui/button";
import { CHILD_PHOTO_NOTICE } from "@/lib/analyze/schema";
import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from "@/lib/og/card";
import { getSourceMode, isMockMode } from "@/lib/mode";
import { getOffersQuote } from "@/lib/offers-server";
import { getPackFromCookies } from "@/lib/packs";
import { canUsePayments } from "@/lib/payments-gate";
import { getResultView } from "@/lib/results";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Open Graph / Twitter preview uses the share card. No personal data in the text fields. */
export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { id } = await params;
  const base: Metadata = {
    title: "Twoje prezenty – Prezentoskop",
    // Results are personal: keep them out of search engines.
    robots: { index: false, follow: false },
  };
  if (!UUID.test(id)) return base;

  const image = { url: cardUrl(id), width: CARD_WIDTH, height: CARD_HEIGHT, alt: "Prezenty dobrane przez AI" };
  const description = "Zobacz 5 prezentów dobranych przez AI i znajdź swój w 60 sekund.";
  return {
    ...base,
    description,
    openGraph: {
      type: "website",
      title: "AI dobrało prezenty – Prezentoskop",
      description,
      url: `/wynik/${id}`,
      images: [image],
      locale: "pl_PL",
      siteName: "Prezentoskop",
    },
    twitter: { card: "summary_large_image", title: "AI dobrało prezenty – Prezentoskop", description, images: [image] },
  };
}

/** Server-rendered result page. Data loads inside Suspense (required with cacheComponents). */
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
  const { result, products } = view;
  const photoSkipped = query.zdjecie === "pominiete";
  const justPaid = query.platnosc === "ok";
  const shared = typeof query.ref === "string" && result.ref_code !== null && query.ref === result.ref_code;
  // Read after the dynamic data above: the promo deadline and the visitor's pack depend on "now" and cookies.
  const quote = getOffersQuote();
  const pack = await getPackFromCookies();
  const paymentsOpen = await canUsePayments();
  // A search from a pack that found too few products goes back into the pack and the result is "none" again.
  const creditRestored = pack !== null && result.paid_status === "none" && (justPaid || query.pakiet === "zwrot");

  // The free web search is still running in the background: show progress, the page refreshes itself.
  if (result.search_status === "searching") return <FreeSearchProgress resultId={result.id} />;

  const webSource = getSourceMode() === "web";
  const hasAffiliate = products.some((product) => product.affiliate);
  // Ready result of a warmed-up combination: pool products, mostly partner links (Ceneo, Webepartners).
  const warmSource = result.free_source === "warm";

  return (
    <div className="flex flex-col gap-8 py-6">
      <ResultTracker
        resultId={result.id}
        shared={shared}
        paidStatus={result.paid_status}
        priceVariant={result.price_variant}
        justPaid={justPaid}
      />
      <header className="flex flex-col gap-3">
        <GiftStack className="mx-auto w-48" />
        <h1 className="text-3xl font-extrabold leading-tight">Twoje 5 trafionych prezentów</h1>
        {result.style_profile && (
          <p className="flex gap-3 rounded-2xl border-[3px] border-ink bg-mint p-4 text-lg">
            <Sparkles className="mt-1 size-5 shrink-0 text-ink" aria-label="Profil stylu" />
            <span>{result.style_profile}</span>
          </p>
        )}
        {photoSkipped && (
          <p className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {CHILD_PHOTO_NOTICE}.
          </p>
        )}
      </header>

      {result.pick_summary && products.length > 0 && (
        <BestMatch summary={result.pick_summary} product={products[0]} />
      )}

      <section aria-labelledby="partner-picks" className="flex flex-col gap-3">
        <h2 id="partner-picks" className="text-2xl font-bold">
          {warmSource ? "Sprawdzone produkty z polskich sklepów" : webSource ? "Wybrane przez AI z polskich sklepów" : "Z naszych sklepów partnerskich"}
        </h2>
        {(warmSource || !webSource || hasAffiliate) && (
          <p className="text-xs text-muted-foreground">
            Linki partnerskie: przy zakupie dostajemy prowizję, cena się dla Ciebie nie zmienia.
          </p>
        )}

        {products.length === 0 ? (
          <p className="rounded-xl border p-4">
            Nie znaleźliśmy pasujących produktów w tym budżecie. Spróbuj z innym budżetem lub zainteresowaniami.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {products.map((product, index) => (
              <ProductCard key={product.id} card={fromResultProduct(product, index + 1, result.id, shared)} />
            ))}
          </ol>
        )}
      </section>

      {justPaid && result.paid_status !== "ready" && result.paid_status !== "refunded" && (
        <p className="rounded-xl bg-secondary p-4 text-sm" role="status">
          Dziękujemy za płatność! Właśnie szukamy prezentów w całym internecie, wyniki pojawią się poniżej.
        </p>
      )}

      <PaidSearchSection
        resultId={result.id}
        status={result.paid_status}
        quote={quote}
        paymentsOpen={paymentsOpen}
        pack={pack ? { searchesLeft: pack.searchesLeft, searchesTotal: pack.searchesTotal } : null}
        creditRestored={creditRestored}
        webPicks={result.webPicks}
        dedications={result.dedications}
      />

      {pack && result.paid_status !== "none" && (
        <PackInfo code={pack.code} searchesLeft={pack.searchesLeft} searchesTotal={pack.searchesTotal} />
      )}

      <div className="flex flex-col gap-3">
        <ShareButton resultId={result.id} refCode={result.ref_code} />
        <SubscribeForm demo={isMockMode()} />
        <Button asChild variant="ghost" size="lg">
          <Link href={shared && result.ref_code ? `/quiz?ref=${result.ref_code}` : "/quiz"}>
            <RotateCcw aria-hidden />
            Szukaj od nowa
          </Link>
        </Button>
      </div>
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

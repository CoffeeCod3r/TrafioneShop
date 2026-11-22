import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, Info } from "lucide-react";

import { fromGuideProduct } from "@/components/products/adapters";
import { ProductCard } from "@/components/products/product-card";
import { GuideCards } from "@/components/guides/guide-links";
import { Button } from "@/components/ui/button";
import { getGuide, GUIDES, GUIDES_PUBLISHED, type Guide } from "@/lib/guides/data";
import { getGuideProducts } from "@/lib/guides/products";

type PageProps = { params: Promise<{ slug: string }> };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SITE_NAME = "Prezentoskop";
const checkedFormat = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });

/** Every guide is prerendered at build time; the product list is cached for a week (see lib/guides/products.ts). */
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const path = `/poradniki/${guide.slug}`;
  return {
    title: `${guide.title} – ${SITE_NAME}`,
    description: guide.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.metaDescription,
      url: path,
      siteName: SITE_NAME,
      locale: "pl_PL",
      publishedTime: GUIDES_PUBLISHED,
    },
    twitter: { card: "summary", title: guide.title, description: guide.metaDescription },
  };
}

export default async function GuidePage(props: PageProps) {
  // Unknown address: not-found UI plus an automatic noindex tag (with Cache Components the status stays 200 once the shell streams).
  const { slug } = await props.params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return (
    <Suspense fallback={<GuideSkeleton />}>
      <GuideContent guide={guide} />
    </Suspense>
  );
}

async function GuideContent({ guide }: { guide: Guide }) {
  const { products, refreshedAt, source } = await getGuideProducts(guide.slug);
  const quizHref = `/quiz?utm_source=${encodeURIComponent(`poradnik_${guide.slug}`)}`;

  return (
    <article className="flex flex-col gap-10 py-8">
      <ArticleJsonLd guide={guide} modified={refreshedAt ?? GUIDES_PUBLISHED} />

      <header className="flex flex-col gap-4">
        <nav aria-label="Okruszki" className="text-sm text-muted-foreground">
          <Link href="/poradniki" className="underline-offset-4 hover:underline">
            Poradniki
          </Link>{" "}
          / {guide.h1}
        </nav>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{guide.h1}</h1>
        {guide.lead.map((paragraph) => (
          <p key={paragraph} className="text-lg leading-relaxed">
            {paragraph}
          </p>
        ))}
      </header>

      {guide.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold leading-snug">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <section aria-labelledby="produkty" className="flex flex-col gap-4">
        <h2 id="produkty" className="text-2xl font-bold">
          Propozycje do sprawdzenia
        </h2>
        {products.length > 0 ? (
          <ol className="flex flex-col gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} card={fromGuideProduct(product)} />
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border p-4">
            Lista produktów jest właśnie odświeżana. Zrób quiz poniżej, a dobierzemy propozycje od razu.
          </p>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Linki do sklepów mogą być linkami partnerskimi: jeśli kupisz po kliknięciu, możemy dostać prowizję, a cena dla
            Ciebie się nie zmienia.
            {source === "stored"
              ? " Produkty wyszukuje AI w polskich sklepach, a cenę i dostępność sprawdza na stronie produktu (data przy produkcie). Listę odświeżamy raz w tygodniu"
              : " Ceny pochodzą z danych sklepów"}
            {refreshedAt ? ` (ostatnio ${checkedFormat.format(new Date(refreshedAt))}).` : "."} Wiążąca jest cena w sklepie.
          </span>
        </p>
      </section>

      <p className="text-lg leading-relaxed">{guide.closing}</p>

      <Button asChild size="xl" className="w-full">
        <Link href={quizHref}>
          <Gift aria-hidden />
          Nie wiesz, co wybrać? Zrób quiz w 60 sekund
        </Link>
      </Button>

      <section aria-labelledby="zobacz-tez" className="flex flex-col gap-3">
        <h2 id="zobacz-tez" className="text-2xl font-bold">
          Zobacz też
        </h2>
        <GuideCards slugs={guide.related} />
      </section>
    </article>
  );
}

/** Structured data: schema.org Article. The JSON is escaped so that it can never close the script tag. */
function ArticleJsonLd({ guide, modified }: { guide: Guide; modified: string }) {
  const url = `${SITE_URL}/poradniki/${guide.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.metaDescription,
    inLanguage: "pl-PL",
    datePublished: GUIDES_PUBLISHED,
    dateModified: modified,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function GuideSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 py-8" aria-busy="true" aria-label="Wczytywanie poradnika">
      <div className="h-10 w-3/4 rounded bg-muted" />
      <div className="h-24 rounded bg-muted" />
      <div className="h-24 rounded bg-muted" />
    </div>
  );
}

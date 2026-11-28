import Image from "next/image";
import { BadgeCheck, ExternalLink, Repeat } from "lucide-react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { Button } from "@/components/ui/button";
import { getIllustration } from "@/lib/illustrations";

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
// "22 lis": short and the same everywhere.
const checkedFormat = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "Europe/Warsaw" });

/** What a card shows. Built by the adapters in components/products/adapters.ts; the card itself knows no data source. */
export type ProductCardData = {
  name: string;
  pricePln: number;
  /** ISO time the price was checked; null hides the "cena sprawdzona" line. */
  checkedAt: string | null;
  /** Shop name, shown as plain text. */
  shop: string;
  /** One sentence: why this product. */
  reason: string | null;
  category: string | null;
  /**
   * A photo from a partner feed. null for every product found on the web (network "direct"): shop photos are never
   * fetched, stored or shown, the category illustration is used instead.
   */
  photoUrl: string | null;
  /** Always a /go/... link (click tracking, allow-list and the real address are resolved there). */
  href: string;
  /** Sends "product_clicked" (consent only) when set. */
  track?: { source: "free" | "share" | "web"; position: number };
  /** Number in the corner of the picture (result pages). */
  badge?: number;
  /** Set when this card replaces an unavailable pick: the original product's name. */
  replaces?: string | null;
  id?: string;
  /** Delay of the reveal animation in ms (result page only). */
  revealDelayMs?: number;
};

/**
 * THE product card: free result, paid result and guides. Picture on top (fixed 4:3, lazy), name (2 lines),
 * price with the check date, shop, one-sentence reason and the big "Zobacz w sklepie" button.
 * Only available products are passed in; an unavailable one is replaced before it gets here.
 */
export function ProductCard({ card }: { card: ProductCardData }) {
  const illustration = getIllustration(card.category);
  const rel = "sponsored nofollow noopener noreferrer";

  return (
    <li
      id={card.id}
      className={`flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border-2 border-border bg-card${card.revealDelayMs !== undefined ? " animate-in fade-in slide-in-from-bottom-4 duration-500" : ""}`}
      style={card.revealDelayMs !== undefined ? { animationDelay: `${card.revealDelayMs}ms`, animationFillMode: "both" } : undefined}
    >
      {card.replaces && (
        <p className="flex items-center gap-2 bg-secondary px-4 py-2 text-xs">
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          Zamiennik: „{card.replaces}” jest chwilowo niedostępny
        </p>
      )}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-mint/50">
        {card.photoUrl ? (
          <Image
            src={card.photoUrl}
            alt={card.name}
            fill
            sizes="(min-width: 768px) 360px, 100vw"
            loading="lazy"
            unoptimized
            className="object-cover"
          />
        ) : (
          <Image
            src={illustration.src}
            alt={illustration.alt}
            width={240}
            height={180}
            loading="lazy"
            unoptimized
            className="size-full object-cover"
          />
        )}
        {card.badge !== undefined && (
          <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">
            {card.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pb-2">
        <h3 className="line-clamp-2 font-semibold leading-snug">{card.name}</h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-bold">{pln.format(card.pricePln)}</span>
          {card.checkedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5" aria-hidden />
              cena sprawdzona {checkedFormat.format(new Date(card.checkedAt))}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{card.shop}</p>
        {card.reason && (
          <p className="mt-1 text-sm">
            <span className="font-medium">Dlaczego to: </span>
            {card.reason}
          </p>
        )}
      </div>
      <div className="p-4 pt-2">
        <Button asChild size="xl" className="w-full">
          {card.track ? (
            <TrackedLink href={card.href} target="_blank" rel={rel} source={card.track.source} position={card.track.position}>
              Zobacz w sklepie
              <ExternalLink aria-hidden />
            </TrackedLink>
          ) : (
            <a href={card.href} target="_blank" rel={rel}>
              Zobacz w sklepie
              <ExternalLink aria-hidden />
            </a>
          )}
        </Button>
      </div>
    </li>
  );
}

import Image from "next/image";
import { ExternalLink, Repeat } from "lucide-react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { Button } from "@/components/ui/button";
import type { ResultProduct } from "@/lib/results";

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

type ProductCardProps = {
  product: ResultProduct;
  position: number;
  resultId: string;
  /** The page was opened from a shared link (?ref=): clicks are recorded as source "share". */
  shared?: boolean;
};

/** Partner product card. The button goes through /go/[id] to record the click. */
export function ProductCard({ product, position, resultId, shared = false }: ProductCardProps) {
  const href = `/go/${product.id}?r=${resultId}${shared ? "&src=share" : ""}`;

  return (
    <li className="overflow-hidden rounded-2xl border-2 border-border bg-card">
      {product.replaces && (
        <p className="flex items-center gap-2 bg-secondary px-4 py-2 text-xs">
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          Zamiennik: „{product.replaces}” jest chwilowo niedostępny
        </p>
      )}
      <div className="flex gap-4 p-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          {product.image_url && (
            <Image src={product.image_url} alt={product.name} fill sizes="96px" unoptimized className="object-cover" />
          )}
          <span className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-white">
            {position}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 font-semibold leading-snug">{product.name}</h3>
          <p className="text-lg font-bold">{pln.format(product.price_pln)}</p>
          <p className="text-sm text-muted-foreground">{product.merchant}</p>
        </div>
      </div>
      {product.reason && (
        <p className="px-4 pb-3 text-sm">
          <span className="font-medium">Dlaczego to: </span>
          {product.reason}
        </p>
      )}
      <div className="px-4 pb-4">
        {product.in_stock ? (
          <Button asChild size="xl" className="w-full">
            <TrackedLink
              href={href}
              target="_blank"
              rel="sponsored nofollow noopener"
              source={shared ? "share" : "free"}
              position={position}
            >
              Zobacz w sklepie
              <ExternalLink aria-hidden />
            </TrackedLink>
          </Button>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
            Produkt jest chwilowo niedostępny.
          </p>
        )}
      </div>
    </li>
  );
}

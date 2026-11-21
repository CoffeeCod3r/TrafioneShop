import { BadgeCheck, ExternalLink } from "lucide-react";

import { CategoryIcon } from "@/components/results/category-icon";
import { Button } from "@/components/ui/button";
import type { GuideProductView } from "@/lib/guides/products";

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const checkedFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

/** Product in a guide: name, price, "why this is a good choice" and a link that goes through /go (click tracking). */
export function GuideProductCard({ product }: { product: GuideProductView }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex gap-4">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-mint/50">
          <CategoryIcon category={product.category} className="size-9" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-3 font-semibold leading-snug">{product.name}</h3>
          <p className="text-lg font-bold">{pln.format(product.price_pln)}</p>
          <p className="text-sm text-muted-foreground">{product.merchant}</p>
          {product.checked_at && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5" aria-hidden />
              cena sprawdzona {checkedFormat.format(new Date(product.checked_at))}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm">
        <span className="font-medium">Dlaczego to dobry wybór: </span>
        {product.reason}
      </p>
      <Button asChild size="xl" className="w-full">
        <a href={`/go/${product.id}`} target="_blank" rel="sponsored nofollow noopener">
          Zobacz w sklepie
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </li>
  );
}

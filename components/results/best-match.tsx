import Image from "next/image";
import { ArrowDown, Heart } from "lucide-react";

import type { ResultProduct } from "@/lib/results";

type BestMatchProps = { summary: string; product: ResultProduct | undefined };

/** "Co najbardziej pasuje i dlaczego": the AI's short explanation of the top pick. */
export function BestMatch({ summary, product }: BestMatchProps) {
  return (
    <section
      aria-labelledby="best-match"
      className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4 rounded-2xl border-[3px] border-ink bg-white p-5 shadow-[5px_5px_0_var(--ribbon)] duration-500"
      style={{ animationFillMode: "both" }}
    >
      <h2 id="best-match" className="flex items-center gap-2 text-2xl font-bold">
        <Heart className="size-6 fill-ribbon text-ribbon" aria-hidden />
        Co najbardziej pasuje i dlaczego
      </h2>
      <div className="flex gap-4">
        {product?.image_url && (
          <div className="relative size-20 shrink-0 -rotate-3 overflow-hidden rounded-lg bg-muted ring-2 ring-ink">
            <Image src={product.image_url} alt={product.name} fill sizes="80px" unoptimized className="object-cover" />
          </div>
        )}
        <p className="text-[17px] leading-relaxed">{summary}</p>
      </div>
      {product && (
        <a
          href="#produkt-1"
          className="inline-flex min-h-11 items-center gap-2 self-start font-semibold underline decoration-ribbon decoration-2 underline-offset-4"
        >
          <ArrowDown className="size-4" aria-hidden />
          Zobacz propozycję nr 1
        </a>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Copy, ExternalLink, Globe, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PaidStatus, PriceVariant } from "@/lib/db";
import type { Dedications, WebPick } from "@/lib/paid/schema";

type PaidSearchSectionProps = {
  resultId: string;
  status: PaidStatus;
  priceVariant: PriceVariant | null;
  webPicks: WebPick[] | null;
  dedications: Dedications | null;
};

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export function PaidSearchSection({ resultId, status, priceVariant, webPicks, dedications }: PaidSearchSectionProps) {
  const router = useRouter();

  // While the search runs, refresh the server component every 3 s.
  useEffect(() => {
    if (status !== "searching") return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [status, router]);

  if (status === "searching") {
    return (
      <Section>
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="font-semibold">Szukamy w całym internecie…</p>
          <p className="text-sm text-muted-foreground">Sprawdzamy ceny i dostępność w każdym sklepie. To potrwa chwilę.</p>
        </div>
      </Section>
    );
  }

  if (status === "refunded") {
    return (
      <Section>
        <p className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm">
          <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
          Nie znaleźliśmy co najmniej 5 sprawdzonych produktów, więc zwróciliśmy pieniądze. Zwrot pojawi się na koncie
          w ciągu kilku dni.
        </p>
      </Section>
    );
  }

  if (status === "ready" && webPicks) {
    return (
      <Section>
        <ol className="flex flex-col gap-4">
          {webPicks.map((pick) => (
            <li key={pick.url} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex gap-4 p-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {pick.imageUrl && (
                    <Image src={pick.imageUrl} alt={pick.title} fill sizes="80px" unoptimized className="object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="line-clamp-2 font-semibold leading-snug">{pick.title}</h3>
                  <p className="text-lg font-bold">{pln.format(pick.pricePln)}</p>
                  <p className="text-sm text-muted-foreground">
                    {pick.shopName ?? pick.shopDomain} · cena sprawdzona {time.format(new Date(pick.checkedAt))}
                  </p>
                </div>
              </div>
              <p className="px-4 pb-3 text-sm">{pick.reason}</p>
              <div className="px-4 pb-4">
                <Button asChild size="lg" variant="outline" className="w-full">
                  <a href={pick.url} target="_blank" rel="noopener noreferrer">
                    Zobacz w sklepie
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {dedications && <DedicationList dedications={dedications} />}
      </Section>
    );
  }

  return <BuyBox resultId={resultId} priceVariant={priceVariant} />;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="web-picks" className="flex flex-col gap-4">
      <h2 id="web-picks" className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <Globe className="size-4" aria-hidden />
        Z całego internetu
      </h2>
      {children}
    </section>
  );
}

function BuyBox({ resultId, priceVariant }: { resultId: string; priceVariant: PriceVariant | null }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = priceVariant ? pln.format(priceVariant / 100) : null;

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId, consent }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) throw new Error(data?.error ?? "Nie udało się rozpocząć płatności.");
      window.location.assign(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się rozpocząć płatności.");
      setBusy(false);
    }
  }

  return (
    <Section>
      <div className="flex flex-col gap-4 rounded-xl border-2 border-primary/30 p-4">
        <div>
          <p className="text-lg font-semibold">Szukaj w całym internecie</p>
          <p className="text-sm text-muted-foreground">
            AI przejrzy zaufane polskie sklepy spoza naszego katalogu, sprawdzi cenę i dostępność każdego produktu i
            pokaże 5–10 propozycji oraz 3 dedykacje na bilecik. Jeśli znajdzie mniej niż 5 sprawdzonych produktów,
            pieniądze wrócą automatycznie.
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>
            Żądam rozpoczęcia usługi przed upływem terminu na odstąpienie od umowy i przyjmuję do wiadomości, że po jej
            wykonaniu utracę prawo odstąpienia.
          </span>
        </label>
        <Button type="button" size="xl" onClick={buy} disabled={!consent || busy || !price}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
          {price ? `Szukaj za ${price}` : "Niedostępne"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Płatność BLIK lub kartą przez Stripe.</p>
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}

function DedicationList({ dedications }: { dedications: Dedications }) {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard can be blocked; the text is still visible to copy by hand.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">Dedykacje na bilecik</h3>
      {dedications.map((text, index) => (
        <div key={text} className="flex items-start gap-3 rounded-xl bg-secondary p-4">
          <p className="flex-1 text-sm italic">„{text}”</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => copy(text, index)}
            aria-label="Kopiuj dedykację"
          >
            {copied === index ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>
      ))}
    </div>
  );
}

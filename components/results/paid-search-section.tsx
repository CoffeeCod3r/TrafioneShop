"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Gift,
  Globe,
  Loader2,
  PenLine,
  RotateCcw,
  SearchCheck,
} from "lucide-react";

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
const checkedFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

const POLL_MS = 3000;
const IN_PROGRESS: PaidStatus[] = ["pending", "searching"];

export const CONSENT_TEXT =
  "Zgadzam się na wykonanie usługi i dostarczenie treści cyfrowej przed upływem 14 dni i przyjmuję do wiadomości utratę prawa odstąpienia od umowy";

export function PaidSearchSection({ resultId, status, priceVariant, webPicks, dedications }: PaidSearchSectionProps) {
  if (IN_PROGRESS.includes(status)) return <SearchProgress resultId={resultId} status={status} />;

  if (status === "refunded") {
    return (
      <Section>
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm">
          <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Przepraszamy! Tym razem nie udało się znaleźć co najmniej 5 sprawdzonych prezentów w innych sklepach, więc
            automatycznie zwróciliśmy pieniądze. Zwrot pojawi się na koncie w ciągu kilku dni roboczych. Twoje darmowe
            propozycje powyżej zostają.
          </p>
        </div>
      </Section>
    );
  }

  if (status === "ready" && webPicks && webPicks.length > 0) {
    return (
      <Section>
        <ol className="flex flex-col gap-4">
          {webPicks.map((pick, index) => (
            <li key={pick.url} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex gap-4 p-4">
                {pick.imageUrl && (
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image src={pick.imageUrl} alt={pick.title} fill sizes="80px" unoptimized className="object-cover" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="line-clamp-2 font-semibold leading-snug">{pick.title}</h3>
                  <p className="text-lg font-bold">{pln.format(pick.pricePln)}</p>
                  <p className="text-sm text-muted-foreground">{pick.shopName ?? pick.shopDomain}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    cena sprawdzona {checkedFormat.format(new Date(pick.checkedAt))}
                  </p>
                </div>
              </div>
              <p className="px-4 pb-3 text-sm">
                <span className="font-medium">Dlaczego to: </span>
                {pick.reason}
              </p>
              <div className="px-4 pb-4">
                <Button asChild size="xl" className="w-full">
                  <a href={`/go/w/${resultId}/${index}`} target="_blank" rel="sponsored nofollow noopener">
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

/** Polls the status every 3 s and re-renders the page when the search finishes. */
function SearchProgress({ resultId, status }: { resultId: string; status: PaidStatus }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      setSeconds((current) => current + POLL_MS / 1000);
      try {
        const response = await fetch(`/api/results/${resultId}/status`, { cache: "no-store" });
        const data = (await response.json()) as { paidStatus?: PaidStatus };
        if (!stopped && data.paidStatus && data.paidStatus !== status) router.refresh();
      } catch {
        // Network hiccup: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [resultId, status, router]);

  const steps = [
    { label: "Szukam w sklepach…", done: status === "searching" && seconds >= 20 },
    { label: "Sprawdzam ceny i dostępność…", done: false },
  ];
  const current = status === "pending" || seconds < 20 ? 0 : 1;

  return (
    <Section>
      <div className="flex flex-col gap-4 rounded-xl border p-5" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <p className="font-semibold">{steps[current].label}</p>
        </div>
        <ol className="flex flex-col gap-2 text-sm">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2">
              {index < current || step.done ? (
                <Check className="size-4 text-primary" aria-hidden />
              ) : index === current ? (
                <SearchCheck className="size-4" aria-hidden />
              ) : (
                <span className="size-4 rounded-full border" aria-hidden />
              )}
              <span className={index > current ? "text-muted-foreground" : undefined}>{step.label}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          To zwykle trwa 1–3 minuty. Możesz zostawić tę stronę otwartą, wyniki pojawią się same.
        </p>
      </div>
    </Section>
  );
}

const BENEFITS = [
  { icon: Gift, text: "5–10 prezentów z innych zaufanych polskich sklepów" },
  { icon: BadgeCheck, text: "Sprawdzona cena i dostępność każdego produktu" },
  { icon: PenLine, text: "3 dedykacje na bilecik do wyboru" },
  { icon: RotateCcw, text: "Zwrot pieniędzy, jeśli znajdziemy mniej niż 5 prezentów" },
];

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
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-semibold">Szukaj w całym internecie</p>
          {price && <p className="shrink-0 text-xl font-bold">{price}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          AI przeszuka zaufane polskie sklepy spoza naszego katalogu, dopasowując prezenty do tego samego profilu.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>{CONSENT_TEXT}.</span>
        </label>
        <Button type="button" size="xl" onClick={buy} disabled={!consent || busy || !price}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
          {price ? `Szukaj za ${price}` : "Niedostępne"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Płatność jednorazowa: BLIK lub karta (Stripe).</p>
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
        <div key={text} className="flex flex-col gap-3 rounded-xl bg-secondary p-4">
          <p className="text-sm italic">„{text}”</p>
          <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => copy(text, index)}>
            {copied === index ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied === index ? "Skopiowano" : "Kopiuj"}
          </Button>
        </div>
      ))}
    </div>
  );
}

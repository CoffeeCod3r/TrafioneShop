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

import { CategoryIcon } from "@/components/results/category-icon";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import type { PaidStatus } from "@/lib/db";
import { type CheckoutOffer, OFFERS, singlesTotal } from "@/lib/offers";
import type { OffersQuote } from "@/lib/offers-server";
import type { Dedications, WebPick } from "@/lib/paid/schema";

type PaidSearchSectionProps = {
  resultId: string;
  status: PaidStatus;
  /** Prices and promo deadline, decided on the server for this page view. */
  quote: OffersQuote;
  /** False while PAYMENTS_ENABLED=false (unless an admin is logged in): show "coming soon" instead of buy buttons. */
  paymentsOpen: boolean;
  /** The visitor's pack of 8 (from the cookie), if any. */
  pack: { searchesLeft: number; searchesTotal: number } | null;
  /** True when a search from a pack just failed and was given back to the pack. */
  creditRestored: boolean;
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

export function PaidSearchSection({
  resultId,
  status,
  quote,
  paymentsOpen,
  pack,
  creditRestored,
  webPicks,
  dedications,
}: PaidSearchSectionProps) {
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
                <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mint/50">
                  {pick.imageUrl ? (
                    <Image src={pick.imageUrl} alt={pick.title} fill sizes="80px" unoptimized className="object-cover" />
                  ) : (
                    <CategoryIcon category={pick.category ?? null} className="size-9" />
                  )}
                </div>
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
                  <a
                    href={`/go/w/${resultId}/${index}`}
                    target="_blank"
                    rel="sponsored nofollow noopener"
                    onClick={() => track("product_clicked", { source: "web", position: index + 1 })}
                  >
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

  if (pack && pack.searchesLeft > 0) {
    return <PackRedeem resultId={resultId} pack={pack} creditRestored={creditRestored} />;
  }
  if (!paymentsOpen) {
    return (
      <Section>
        <p className="rounded-2xl border-[3px] border-ink bg-lilac/60 p-5 text-center font-semibold shadow-[5px_5px_0_var(--ink)]">
          Więcej propozycji z całego internetu – już wkrótce
        </p>
      </Section>
    );
  }
  return <OfferPicker resultId={resultId} quote={quote} packUsedUp={pack !== null} />;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="web-picks" className="flex flex-col gap-4">
      <h2 id="web-picks" className="flex items-center gap-2 text-2xl font-bold">
        <Globe className="size-6 text-ribbon" aria-hidden />
        Więcej propozycji
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
        if (stopped || !data.paidStatus || data.paidStatus === status) return;
        // Back to "none": a search from a pack found too few products and went back into the pack.
        if (data.paidStatus === "none") router.replace(`/wynik/${resultId}?pakiet=zwrot`);
        else router.refresh();
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
  { icon: Gift, text: "10 prezentów zamiast 5, z całego internetu" },
  { icon: BadgeCheck, text: "Sprawdzona cena i dostępność każdego produktu" },
  { icon: PenLine, text: "Do tego 3 dedykacje na bilecik do wyboru" },
  { icon: RotateCcw, text: "Zwrot pieniędzy, jeśli znajdziemy mniej niż 5 prezentów" },
];

const promoDate = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

const pad = (value: number) => String(value).padStart(2, "0");

/** Time left until the promo deadline; ticks every second and refreshes the page when it ends. */
function Countdown({ endsAt, serverNow }: { endsAt: string; serverNow: number }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    // The deadline is a fixed moment for everybody; the server clock corrects a wrong device clock.
    const skew = serverNow - Date.now();
    const end = new Date(endsAt).getTime();
    let expired = false;
    const tick = () => {
      const remaining = end - (Date.now() + skew);
      setLeft(Math.max(remaining, 0));
      if (remaining <= 0 && !expired) {
        expired = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt, serverNow, router]);

  if (left === null) return <>do {promoDate.format(new Date(endsAt))}</>;
  const totalSeconds = Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const clock = `${pad(Math.floor((totalSeconds % 86400) / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  return (
    <>
      jeszcze {days > 0 ? `${days} d ` : ""}
      <span className="tabular-nums">{clock}</span>
    </>
  );
}

const grosze = (value: number) => pln.format(value / 100);

function OfferPicker({ resultId, quote, packUsedUp }: { resultId: string; quote: OffersQuote; packUsedUp: boolean }) {
  const router = useRouter();
  // The pack is pre-selected; the single search is one tap away.
  const [offer, setOffer] = useState<CheckoutOffer>("pack10");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = quote.prices[offer];

  const packPrice = quote.prices.pack10;
  const perPerson = packPrice / OFFERS.pack10.searches;
  const savings = singlesTotal(OFFERS.pack10.searches) - packPrice;

  useEffect(() => {
    track("web_search_viewed", { promo_active: quote.promoActive });
  }, [quote.promoActive]);

  function choose(next: CheckoutOffer) {
    setOffer(next);
    track("offer_selected", { offer: next, promo_active: quote.promoActive });
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId, consent, offer, expectedAmountGrosze: amount }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string; priceChanged?: boolean } | null;
      if (data?.priceChanged) router.refresh();
      if (!response.ok || !data?.url) throw new Error(data?.error ?? "Nie udało się rozpocząć płatności.");
      window.location.assign(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się rozpocząć płatności.");
      setBusy(false);
    }
  }

  return (
    <Section>
      <div className="flex flex-col gap-4 rounded-2xl border-[3px] border-ink bg-lilac/60 p-5 shadow-[5px_5px_0_var(--ink)]">
        <p className="text-sm text-muted-foreground">
          AI przeszuka zaufane polskie sklepy w całym internecie i dobierze 10 kolejnych prezentów do tego samego profilu,
          bez powtórzeń z darmowego wyniku.
          {packUsedUp && " Wykorzystałeś już wszystkie wyszukiwania z poprzedniego pakietu."}
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
              {text}
            </li>
          ))}
        </ul>

        <div role="radiogroup" aria-label="Wybierz ofertę" className="flex flex-col gap-3">
          <OfferOption
            selected={offer === "pack10"}
            onSelect={() => choose("pack10")}
            title="Pakiet na 10 osób"
            price={grosze(packPrice)}
            badge={
              quote.promoActive && quote.promoEndsAt ? (
                <>
                  Promocja: <Countdown endsAt={quote.promoEndsAt} serverNow={quote.serverNow} />
                </>
              ) : null
            }
          >
            <span>10 wyszukiwań dla 10 różnych osób, wykorzystasz je kiedy chcesz (to {grosze(Math.round(perPerson))} za osobę).</span>
            <span>
              Osobno 10 wyszukiwań kosztuje {grosze(singlesTotal(OFFERS.pack10.searches))}: oszczędzasz {grosze(savings)}.
            </span>
            {quote.promoActive && quote.promoEndsAt && (
              <span className="font-medium">
                Cena promocyjna do {promoDate.format(new Date(quote.promoEndsAt))}, potem {grosze(OFFERS.pack10.regularGrosze)}.
              </span>
            )}
          </OfferOption>
          <OfferOption
            selected={offer === "single"}
            onSelect={() => choose("single")}
            title="Jedno wyszukiwanie"
            price={grosze(quote.prices.single)}
            badge={null}
          >
            <span>Dla jednej osoby, czyli dla tego wyniku.</span>
          </OfferOption>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>{CONSENT_TEXT}.</span>
        </label>
        <Button type="button" size="xl" onClick={buy} disabled={!consent || busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
          {offer === "pack10" ? `Kup pakiet za ${grosze(amount)}` : `Szukaj za ${grosze(amount)}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Płatność jednorazowa: BLIK lub karta (Stripe). Jeśli nie znajdziemy co najmniej 5 prezentów, przy jednym
          wyszukiwaniu zwracamy pieniądze, a przy pakiecie wyszukiwanie wraca do pakietu.
        </p>
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}

function OfferOption({
  selected,
  onSelect,
  title,
  price,
  badge,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer flex-col gap-2 rounded-xl border-[3px] bg-card p-4 transition-colors ${
        selected ? "border-ink shadow-[3px_3px_0_var(--ink)]" : "border-transparent outline outline-1 outline-border"
      }`}
    >
      {badge && (
        <span className="self-start rounded-full bg-ink px-3 py-1 text-xs font-bold text-white" aria-live="off">
          {badge}
        </span>
      )}
      <span className="flex items-center gap-3">
        <input
          type="radio"
          name="offer"
          checked={selected}
          onChange={onSelect}
          className="size-5 shrink-0 accent-primary"
        />
        <span className="flex-1 text-lg font-semibold leading-tight">{title}</span>
        <span className="shrink-0 text-xl font-bold">{price}</span>
      </span>
      <span className="flex flex-col gap-1 pl-8 text-sm text-muted-foreground">{children}</span>
    </label>
  );
}

function PackRedeem({
  resultId,
  pack,
  creditRestored,
}: {
  resultId: string;
  pack: { searchesLeft: number; searchesTotal: number };
  creditRestored: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/pack/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? "Nie udało się uruchomić wyszukiwania.");
      track("pack_redeemed", { left: pack.searchesLeft - 1 });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się uruchomić wyszukiwania.");
      setBusy(false);
    }
  }

  return (
    <Section>
      <div className="flex flex-col gap-4 rounded-2xl border-[3px] border-ink bg-lilac/60 p-5 shadow-[5px_5px_0_var(--ink)]">
        {creditRestored && (
          <p className="rounded-lg bg-secondary p-3 text-sm" role="status">
            Tym razem nie znaleźliśmy co najmniej 5 sprawdzonych prezentów, więc to wyszukiwanie wróciło do Twojego
            pakietu. Możesz spróbować jeszcze raz.
          </p>
        )}
        <p className="text-lg font-semibold">
          Masz pakiet: zostało {pack.searchesLeft} z {pack.searchesTotal} wyszukiwań
        </p>
        <p className="text-sm text-muted-foreground">
          Użyj jednego wyszukiwania dla tej osoby, bez ponownej płatności.
        </p>
        <Button type="button" size="xl" onClick={redeem} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
          Szukaj w internecie (użyj 1 z pakietu)
        </Button>
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

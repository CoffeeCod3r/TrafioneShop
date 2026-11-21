"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, SearchCheck } from "lucide-react";

import { GiftStack } from "@/components/illustrations/gift-stack";
import type { SearchStatus } from "@/lib/db";

const POLL_MS = 3000;

const STEPS = [
  { label: "AI analizuje styl…", fromSeconds: 0 },
  { label: "Szukam w sklepach…", fromSeconds: 3 },
  { label: "Sprawdzam ceny…", fromSeconds: 30 },
];

/**
 * Shown while the free web search runs in the background. Polls the status every 3 s and
 * re-renders the page as soon as the result is ready.
 */
export function FreeSearchProgress({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      setSeconds((current) => current + POLL_MS / 1000);
      try {
        const response = await fetch(`/api/results/${resultId}/status`, { cache: "no-store" });
        const data = (await response.json()) as { searchStatus?: SearchStatus };
        if (!stopped && data.searchStatus === "ready") router.refresh();
      } catch {
        // Network hiccup: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [resultId, router]);

  const current = STEPS.reduce((index, step, position) => (seconds >= step.fromSeconds ? position : index), 0);

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center" role="status" aria-live="polite">
      <GiftStack className="w-48 animate-[gift-bob_1.6s_ease-in-out_infinite]" />
      <h1 className="text-2xl font-extrabold leading-tight">Szukamy dla Ciebie prezentów</h1>
      <ol className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border-[3px] border-ink bg-white p-5 text-left shadow-[5px_5px_0_var(--ribbon)]">
        {STEPS.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            {index < current ? (
              <Check className="size-5 text-primary" aria-hidden />
            ) : index === current ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <SearchCheck className="size-5 text-muted-foreground" aria-hidden />
            )}
            <span className={index > current ? "text-muted-foreground" : index === current ? "font-semibold" : undefined}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="max-w-sm text-sm text-muted-foreground">
        To zwykle trwa 1–2 minuty. Możesz zostawić tę stronę otwartą, wyniki pojawią się same.
      </p>
    </div>
  );
}

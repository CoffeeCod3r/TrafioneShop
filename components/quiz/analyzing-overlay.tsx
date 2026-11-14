"use client";

import { useEffect, useState } from "react";
import { Gift, Sparkles } from "lucide-react";

const MESSAGES = [
  "AI analizuje styl…",
  "Przeglądamy sklepy partnerskie…",
  "Wybieramy 5 najlepszych prezentów…",
  "Jeszcze chwilka, pakujemy pomysły…",
];

/** Full-screen loader shown while /api/analyze runs. */
export function AnalyzingOverlay() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => Math.min(current + 1, MESSAGES.length - 1)), 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/95 px-6 text-center backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden />
        <div className="relative flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Gift className="size-12 animate-bounce" aria-hidden />
        </div>
        <Sparkles className="absolute -right-3 -top-3 size-8 animate-pulse text-primary" aria-hidden />
      </div>
      <p key={index} className="animate-in fade-in slide-in-from-bottom-2 text-xl font-semibold duration-500">
        {MESSAGES[index]}
      </p>
      <p className="text-sm text-muted-foreground">To zwykle trwa kilka sekund.</p>
    </div>
  );
}

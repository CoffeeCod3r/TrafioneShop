"use client";

import { useEffect, useState } from "react";
import { GiftStack } from "@/components/illustrations/gift-stack";

const MESSAGES = [
  "AI analizuje styl…",
  "Dobieramy pomysły na prezent…",
  "Szykujemy 5 najlepszych propozycji…",
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-paper/95 px-6 text-center backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <GiftStack className="w-64 animate-[gift-bob_1.6s_ease-in-out_infinite]" />
      <p key={index} className="animate-in fade-in slide-in-from-bottom-2 font-display text-2xl font-bold duration-500">
        {MESSAGES[index]}
      </p>
      <p className="text-sm text-muted-foreground">To zwykle trwa kilka sekund.</p>
    </div>
  );
}

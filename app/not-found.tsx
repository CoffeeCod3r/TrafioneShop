import type { Metadata } from "next";
import Link from "next/link";
import { Gift, Home } from "lucide-react";

import { GiftStack } from "@/components/illustrations/gift-stack";
import { GuideCards } from "@/components/guides/guide-links";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Nie znaleziono strony – Prezentoskop",
  description: "Tej strony nie ma, ale prezent dla bliskiej osoby znajdziesz w minutę.",
};

/** 404 for every unknown address: a friendly message, the quiz as the main action and two guides to browse. */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-8 py-12 text-center">
      <GiftStack className="w-48" />
      <div className="flex flex-col gap-3">
        <p className="font-display text-6xl font-extrabold text-ribbon" aria-hidden>
          404
        </p>
        <h1 className="text-3xl font-extrabold leading-tight">Tej strony nie ma</h1>
        <p className="mx-auto max-w-md text-lg">
          Ten adres nie prowadzi do żadnej strony. Za to prezent dla bliskiej osoby znajdziesz w około minutę.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button asChild size="xl">
          <Link href="/quiz">
            <Gift aria-hidden />
            Zrób quiz w 60 sekund
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">
            <Home aria-hidden />
            Wróć na stronę główną
          </Link>
        </Button>
      </div>
      <section aria-labelledby="polecane" className="flex w-full flex-col gap-3 text-left">
        <h2 id="polecane" className="text-xl font-bold">
          Zajrzyj do poradników
        </h2>
        <GuideCards slugs={["prezent-dla-mamy-do-100-zl", "prezent-dla-taty-do-100-zl"]} />
        <Link href="/poradniki" className="text-sm font-semibold underline underline-offset-4">
          Wszystkie poradniki
        </Link>
      </section>
    </div>
  );
}

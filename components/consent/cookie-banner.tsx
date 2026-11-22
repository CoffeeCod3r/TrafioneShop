"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OPEN_SETTINGS_EVENT, readConsent, writeConsent } from "@/lib/consent/storage";

/**
 * Cookie consent. Necessary storage works without consent; analytics (PostHog) only after "Akceptuję".
 * Both choices are equally easy, and the decision can be changed from the footer at any time.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Read after mount: the server render cannot know the browser's choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with localStorage once on mount
    setOpen(readConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);

  if (!open) return null;

  function choose(value: "granted" | "denied") {
    writeConsent(value);
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-4 pb-[calc(72px+env(safe-area-inset-bottom))] shadow-lg sm:pb-4"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <p id="cookie-title" className="flex items-center gap-2 font-semibold">
          <Cookie className="size-5" aria-hidden />
          Pliki cookies
        </p>
        <p className="text-xs text-muted-foreground">
          Niezbędne pliki cookies działają zawsze. Analityka PostHog tylko za Twoją zgodą.{" "}
          <Link href="/prywatnosc#cookies" className="underline underline-offset-4">
            Szczegóły
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" size="lg" onClick={() => choose("denied")}>
            Tylko niezbędne
          </Button>
          <Button type="button" size="lg" onClick={() => choose("granted")}>
            Akceptuję
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
      className="inline-flex min-h-11 items-center text-left underline-offset-4 hover:underline"
    >
      Ustawienia cookies
    </button>
  );
}

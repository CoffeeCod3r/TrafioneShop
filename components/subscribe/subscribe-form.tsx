"use client";

import { useId, useState } from "react";
import { BellRing, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { MARKETING_CONSENT_TEXT, SUBSCRIBE_OCCASIONS, type SubscribeOccasion } from "@/lib/subscribe/schema";
import { cn } from "@/lib/utils";

/** Newsletter / occasion reminders sign-up. Double opt-in: nothing is sent until the email link is clicked. */
export function SubscribeForm() {
  const emailId = useId();
  const consentId = useId();
  const [email, setEmail] = useState("");
  const [occasions, setOccasions] = useState<SubscribeOccasion[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function toggle(value: SubscribeOccasion) {
    setOccasions((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (occasions.length === 0) return setError("Wybierz co najmniej jedną okazję.");
    if (!consent) return setError("Zaznacz zgodę, aby się zapisać.");

    setBusy(true);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, occasions, consent, website }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Nie udało się zapisać.");
      setDone(data?.message ?? "Sprawdź skrzynkę i potwierdź zapis.");
      track("subscribed", { occasions: occasions.length });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-xl border p-4" role="status">
        <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p className="text-sm">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border p-4" noValidate>
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h2 className="font-semibold">Przypomnimy Ci o prezentach</h2>
          <p className="text-sm text-muted-foreground">Napiszemy z wyprzedzeniem przed wybranymi okazjami.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          E-mail
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ty@example.pl"
          className="h-12 rounded-xl border-2 bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Okazje</legend>
        <div className="flex flex-wrap gap-2">
          {SUBSCRIBE_OCCASIONS.map((occasion) => {
            const selected = occasions.includes(occasion.value);
            return (
              <button
                key={occasion.value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(occasion.value)}
                className={cn(
                  "min-h-11 rounded-full border-2 px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40",
                )}
              >
                {occasion.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Honeypot: hidden from people, bots tend to fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        className="hidden"
        aria-hidden
      />

      <label htmlFor={consentId} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>{MARKETING_CONSENT_TEXT}</span>
      </label>

      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Zapisz mnie
      </Button>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

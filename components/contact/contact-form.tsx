"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";

import { TurnstileWidget, type TurnstileHandle } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, CONTACT_NAME_MAX } from "@/lib/contact/schema";

const inputClass =
  "rounded-xl border-2 bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type ContactFormProps = {
  /** MOCK_MODE: no Turnstile widget (the demo captcha always passes). */
  demo?: boolean;
};

/** Simple contact form: name (optional), e-mail, message. Protected by Turnstile and a honeypot. */
export function ContactForm({ demo = false }: ContactFormProps) {
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(demo ? "demo" : null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const handleToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (message.trim().length < CONTACT_MESSAGE_MIN) return setError(`Napisz co najmniej ${CONTACT_MESSAGE_MIN} znaków.`);
    if (!turnstileToken) return setError("Trwa weryfikacja, spróbuj za sekundę.");

    setBusy(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, message, website, turnstileToken }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Nie udało się wysłać wiadomości.");
      setDone(data?.message ?? "Dziękujemy! Wiadomość została wysłana.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się wysłać wiadomości.");
      // Turnstile tokens are single-use.
      if (!demo) turnstileRef.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-xl border p-4" role="status">
        <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 p-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium">
          Imię <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
        </label>
        <input
          id={nameId}
          type="text"
          autoComplete="given-name"
          maxLength={CONTACT_NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`h-12 ${inputClass}`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          Twój e-mail
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
          className={`h-12 ${inputClass}`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={messageId} className="text-sm font-medium">
          Wiadomość
        </label>
        <textarea
          id={messageId}
          required
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={`${messageId}-hint`}
          className={`resize-y py-3 ${inputClass}`}
        />
        <p id={`${messageId}-hint`} className="text-right text-sm text-muted-foreground" aria-live="polite">
          {message.length}/{CONTACT_MESSAGE_MAX}
        </p>
      </div>

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

      <p className="text-sm text-muted-foreground">
        Twój adres i wiadomość wykorzystamy tylko po to, żeby Ci odpowiedzieć. Szczegóły w{" "}
        <Link href="/prywatnosc" className="underline underline-offset-4">
          polityce prywatności
        </Link>
        .
      </p>

      {!demo && <TurnstileWidget ref={turnstileRef} action="contact" onToken={handleToken} />}

      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Wyślij wiadomość
      </Button>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

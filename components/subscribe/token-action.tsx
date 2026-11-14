"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type TokenActionProps = {
  token: string;
  endpoint: string;
  buttonLabel: string;
  successMessage: string;
};

/** One-button confirm/unsubscribe. A POST on click, so mail link scanners cannot trigger it. */
export function TokenAction({ token, endpoint, buttonLabel, successMessage }: TokenActionProps) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Coś poszło nie tak.");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <CheckCircle2 className="size-10 text-primary" aria-hidden />
        <p className="text-lg">{successMessage}</p>
        <Button asChild variant="outline" size="lg">
          <Link href="/">Wróć na stronę główną</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" size="xl" onClick={run} disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {buttonLabel}
      </Button>
      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

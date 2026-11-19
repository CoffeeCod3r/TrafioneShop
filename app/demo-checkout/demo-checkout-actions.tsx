"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = { session: string; resultId: string; offer: "single" | "pack8"; amount: number; cancelUrl: string };

export function DemoCheckoutActions({ session, resultId, offer, amount, cancelUrl }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/demo-checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, resultId, offer, amount }),
      });
      const data = (await response.json().catch(() => null)) as { redirect?: string; error?: string } | null;
      if (!response.ok || !data?.redirect) throw new Error(data?.error ?? "Płatność demo nie powiodła się.");
      router.push(data.redirect);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Płatność demo nie powiodła się.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" size="xl" onClick={pay} disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Zapłać (demo)
      </Button>
      <Button type="button" size="xl" variant="outline" onClick={() => router.push(cancelUrl)} disabled={busy}>
        Anuluj
      </Button>
      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

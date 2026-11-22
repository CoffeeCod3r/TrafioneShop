"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** "Sprawdź linki teraz": starts the weekly link and price check by hand and refreshes the numbers while it runs. */
export function CheckLinksButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = busy || running;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [running, router]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/check-links", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { started?: boolean; reason?: string };
      if (!response.ok) setMessage("Nie udało się uruchomić sprawdzania.");
      else if (body.reason === "already_running") setMessage("Sprawdzanie już trwa.");
      else setMessage("Sprawdzanie ruszyło. Liczby odświeżą się same.");
      router.refresh();
    } catch {
      setMessage("Nie udało się uruchomić sprawdzania.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="xl" variant="outline" onClick={start} disabled={active} className="w-full sm:w-auto">
        {active ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {active ? "Sprawdzanie trwa…" : "Sprawdź linki teraz"}
      </Button>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

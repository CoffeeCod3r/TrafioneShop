"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shown to the owner of a pack of 8 (cookie) after a search was used: what is left and how to reuse the pack. */
export function PackInfo({ code, searchesLeft, searchesTotal }: { code: string; searchesLeft: number; searchesTotal: number }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pakiet/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the button label stays as it is.
    }
  }

  return (
    <section aria-label="Twój pakiet" className="flex flex-col gap-3 rounded-2xl border-[3px] border-ink bg-mint p-5">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <PackageOpen className="size-5" aria-hidden />
        Pakiet na 8 osób: zostało {searchesLeft} z {searchesTotal}
      </p>
      {searchesLeft > 0 ? (
        <p className="text-sm">
          Zrób quiz dla kolejnej osoby i na jej wyniku kliknij „Szukaj w internecie”, bez ponownej płatności.
        </p>
      ) : (
        <p className="text-sm">Wykorzystałeś wszystkie wyszukiwania z pakietu.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {searchesLeft > 0 && (
          <Button asChild size="lg" className="sm:flex-1">
            <Link href="/quiz">Szukaj dla kolejnej osoby</Link>
          </Button>
        )}
        <Button type="button" variant="outline" size="lg" className="sm:flex-1" onClick={copyLink}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Skopiowano link" : "Kopiuj link do pakietu"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Link otwiera pakiet na innym urządzeniu. Nie udostępniaj go: każdy, kto go ma, może zużyć Twoje wyszukiwania.
      </p>
    </section>
  );
}

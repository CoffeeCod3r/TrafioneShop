import type { ReactNode } from "react";

import { isLegalComplete, LEGAL } from "@/lib/legal-config";
import { CONTACT_EMAIL } from "@/lib/site";

/** Highlighted placeholder for the owner's data or a decision to make. */
export function Fill({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-yellow-200 px-1 font-semibold text-black">{children}</mark>;
}

/** A value from lib/legal-config.ts, or a yellow placeholder while it is still missing. */
export function Val({ v, ph }: { v: string | number | null; ph: string }) {
  return v === null ? <Fill>{ph}</Fill> : <>{v}</>;
}

/** A text that a lawyer still has to confirm: highlighted until `lawyerReviewed` is set. */
export function Review({ children }: { children: ReactNode }) {
  return LEGAL.lawyerReviewed || LEGAL.hideDraftMarkers ? null : <Fill>[{children}]</Fill>;
}

/** The public contact address as a mailto link. */
export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  );
}

export function DraftNotice() {
  if (isLegalComplete()) return null;
  return (
    <p className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-950">
      <strong>SZKIC DO WERYFIKACJI.</strong> Ten dokument nie jest jeszcze obowiązujący. Żółte pola trzeba uzupełnić
      własnymi danymi, a całość warto przed publikacją sprawdzić z prawnikiem.
    </p>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-6 py-10 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">Wersja z dnia {updated}</p>
      </header>
      <DraftNotice />
      {children}
    </article>
  );
}

/** Owner data block, reused in both documents. */
export function OwnerData() {
  return (
    <ul>
      <li>
        Imię i nazwisko / firma: <Val v={LEGAL.ownerName} ph="[IMIĘ I NAZWISKO albo nazwa firmy]" />
      </li>
      <li>
        Adres: <Val v={LEGAL.address} ph="[ULICA I NUMER, KOD POCZTOWY, MIASTO]" />
      </li>
      {LEGAL.taxId !== "" && (
        <li>
          NIP / REGON: <Val v={LEGAL.taxId} ph="[NIP / REGON albo ustaw pusty tekst, jeśli działalność nierejestrowana]" />
        </li>
      )}
      <li>
        E-mail kontaktowy: <ContactEmail />
      </li>
    </ul>
  );
}

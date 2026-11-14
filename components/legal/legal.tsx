import type { ReactNode } from "react";

/** Highlighted placeholder for the owner's data or a decision to make. */
export function Fill({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-yellow-200 px-1 font-semibold text-black">{children}</mark>;
}

export function DraftNotice() {
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
        Imię i nazwisko / firma: <Fill>[IMIĘ I NAZWISKO / NAZWA FIRMY]</Fill>
      </li>
      <li>
        Adres: <Fill>[ADRES]</Fill>
      </li>
      <li>
        NIP / REGON (jeśli działalność): <Fill>[NIP / REGON albo usuń, jeśli działalność nierejestrowana]</Fill>
      </li>
      <li>
        E-mail kontaktowy: <Fill>[E-MAIL]</Fill>
      </li>
    </ul>
  );
}

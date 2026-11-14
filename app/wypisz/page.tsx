import { Suspense } from "react";
import type { Metadata } from "next";

import { TokenAction } from "@/components/subscribe/token-action";

export const metadata: Metadata = { title: "Wypisz się – Prezentownik AI", robots: { index: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function UnsubscribePage(props: PageProps) {
  return (
    <section className="flex flex-col gap-6 py-12">
      <h1 className="text-2xl font-bold">Wypisz się z wiadomości</h1>
      <p className="text-muted-foreground">Usuniemy Twój adres e-mail z listy. Nie wyślemy już żadnych wiadomości.</p>
      <Suspense fallback={null}>
        <UnsubscribeAction {...props} />
      </Suspense>
    </section>
  );
}

async function UnsubscribeAction({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) return <p>Brakuje linku do wypisania. Otwórz go z e-maila.</p>;
  return (
    <TokenAction
      token={token}
      endpoint="/api/unsubscribe"
      buttonLabel="Wypisz mnie"
      successMessage="Wypisaliśmy Cię i usunęliśmy Twój adres z listy."
    />
  );
}

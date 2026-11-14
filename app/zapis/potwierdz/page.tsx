import { Suspense } from "react";
import type { Metadata } from "next";

import { TokenAction } from "@/components/subscribe/token-action";

export const metadata: Metadata = { title: "Potwierdź zapis – Prezentownik AI", robots: { index: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ConfirmSubscriptionPage(props: PageProps) {
  return (
    <section className="flex flex-col gap-6 py-12">
      <h1 className="text-2xl font-bold">Potwierdź zapis</h1>
      <p className="text-muted-foreground">
        Kliknij przycisk, aby zacząć dostawać przypomnienia o okazjach i pomysły na prezenty.
      </p>
      <Suspense fallback={null}>
        <ConfirmAction {...props} />
      </Suspense>
    </section>
  );
}

async function ConfirmAction({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) return <p>Brakuje linku potwierdzającego. Otwórz go z e-maila.</p>;
  return (
    <TokenAction
      token={token}
      endpoint="/api/subscribe/confirm"
      buttonLabel="Potwierdzam zapis"
      successMessage="Gotowe! Zapis potwierdzony. Odezwiemy się przed wybranymi okazjami."
    />
  );
}

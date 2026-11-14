import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";

import { isMockMode } from "@/lib/mode";

import { DemoCheckoutActions } from "./demo-checkout-actions";

export const metadata: Metadata = { title: "Płatność (demo) – Prezentownik AI", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Stand-in for Stripe Checkout in MOCK_MODE. */
export default function DemoCheckoutPage(props: PageProps) {
  if (!isMockMode()) notFound();
  return (
    <Suspense fallback={null}>
      <DemoCheckout {...props} />
    </Suspense>
  );
}

async function DemoCheckout({ searchParams }: PageProps) {
  const query = await searchParams;
  const session = typeof query.session === "string" ? query.session : "";
  const resultId = typeof query.result === "string" ? query.result : "";
  const variant = query.variant === "499" ? 499 : query.variant === "999" ? 999 : null;
  const cancel = typeof query.cancel === "string" && query.cancel.includes("/wynik/") ? query.cancel : `/wynik/${resultId}`;

  if (!session.startsWith("demo_cs_") || !UUID.test(resultId) || !variant) notFound();
  // Keep the user on this site: only use the path of the cancel URL.
  let cancelPath = `/wynik/${resultId}`;
  try {
    cancelPath = cancel.startsWith("/") ? cancel : new URL(cancel).pathname;
  } catch {
    // keep the default
  }

  return (
    <div className="flex flex-col gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <CreditCard className="size-10" aria-hidden />
        <h1 className="text-2xl font-bold">Płatność testowa</h1>
        <p className="text-muted-foreground">
          To udawana bramka płatności z trybu demo. Żadne pieniądze nie zostaną pobrane.
        </p>
      </div>
      <dl className="divide-y rounded-xl border">
        <div className="flex justify-between px-4 py-3">
          <dt>Usługa</dt>
          <dd className="font-medium">Szukaj w całym internecie</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt>Kwota</dt>
          <dd className="font-bold">{pln.format(variant / 100)}</dd>
        </div>
      </dl>
      <DemoCheckoutActions session={session} resultId={resultId} variant={variant} cancelUrl={cancelPath} />
    </div>
  );
}

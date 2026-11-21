import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdminLoginForm, AdminLogoutButton } from "@/components/admin/login-form";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin/auth";
import { AI_PRICES, getAdminStats, PERIODS, type AdminStats, type Period } from "@/lib/admin/stats";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin – Prezentoskop", robots: { index: false, follow: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 });
const plnPrecise = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const num = new Intl.NumberFormat("pl-PL");
const pct = (value: number | null) => (value === null ? "–" : `${(value * 100).toFixed(1).replace(".", ",")}%`);
const dec = (value: number | null, digits = 2) => (value === null ? "–" : value.toFixed(digits).replace(".", ","));

export default function AdminPage(props: PageProps) {
  return (
    <Suspense fallback={<p className="py-10 text-muted-foreground">Wczytywanie…</p>}>
      <AdminGate {...props} />
    </Suspense>
  );
}

async function AdminGate({ searchParams }: PageProps) {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!isValidAdminSession(session)) return <AdminLoginForm />;

  const query = await searchParams;
  const period: Period = PERIODS.some((p) => p.value === query.okres) ? (query.okres as Period) : "7d";
  const stats = await getAdminStats(period);
  return <Dashboard stats={stats} period={period} />;
}

function Dashboard({ stats, period }: { stats: AdminStats; period: Period }) {
  return (
    <div className="flex flex-col gap-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Panel admina</h1>
        <AdminLogoutButton />
      </header>

      <nav className="flex gap-2" aria-label="Okres">
        {PERIODS.map((item) => (
          <Link
            key={item.value}
            href={`/admin?okres=${item.value}`}
            aria-current={item.value === period ? "page" : undefined}
            className={cn(
              "min-h-11 rounded-full border-2 px-4 py-2 text-sm font-medium",
              item.value === period ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Rozpoczęte quizy (wizyty)" value={num.format(stats.quizStarts)} />
        <Tile label="Wyniki" value={num.format(stats.results)} />
        <Tile label="Odsetek ukończeń" value={pct(stats.completion)} />
        <Tile
          label="Kliknięcia"
          value={num.format(stats.clicks)}
          hint={`darmowe z sieci ${stats.clicksBySource["free-web"]} · katalog ${stats.clicksBySource.catalog + stats.clicksBySource.free} · udost. ${stats.clicksBySource.share} · płatne ${stats.clicksBySource["paid-web"] + stats.clicksBySource.web}`}
        />
        <Tile label="Kliknięcia na wynik" value={dec(stats.clicksPerResult)} />
        <Tile label="Płatności / zwroty" value={`${stats.payments} / ${stats.refunds}`} />
        <Tile label="Przychód (netto po zwrotach)" value={pln.format(stats.revenue)} />
        <Tile
          label="Przychód na wizytę"
          value={stats.revenuePerVisit === null ? "–" : plnPrecise.format(stats.revenuePerVisit)}
          hint="wizyta = rozpoczęty quiz; bez prowizji partnerskich"
        />
      </section>

      <Section title="Sprawdzenie cen">
        <Table
          head={["Wariant", "Wyniki", "Płatności", "Konwersja", "Przychód / 100 wyników", "Zwroty"]}
          rows={stats.priceTest.map((row) => [
            pln.format(row.variant / 100),
            num.format(row.results),
            num.format(row.payments),
            pct(row.conversion),
            row.revenuePer100Results === null ? "–" : pln.format(row.revenuePer100Results),
            pct(row.refundRate),
          ])}
        />
      </Section>

      <Section title="Darmowe wyniki: źródło i limit dzienny">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile
            label="Dzienny limit AI"
            value={`${pln.format(stats.dailyBudget.spentPln)} / ${pln.format(stats.dailyBudget.limitPln)}`}
            hint={`wykorzystano ${pct(stats.dailyBudget.share)} (DAILY_AI_BUDGET_PLN, dziś od północy)`}
          />
          <Tile
            label="Trafienia z pamięci wyników"
            value={num.format(stats.freeSources.cache)}
            hint={`${pct(stats.cacheHitRate)} wyników z pamięci (24 h)`}
          />
          <Tile
            label="Wyszukiwania w sieci (darmowe)"
            value={num.format(stats.ai.freeWebSearches)}
            hint={`${stats.ai.avgFreeWebSearchPln === null ? "–" : plnPrecise.format(stats.ai.avgFreeWebSearchPln)} / wyszukiwanie · razem ${pln.format(stats.ai.freeWebPln)}`}
          />
        </div>
        <Table
          head={["Źródło darmowych propozycji", "Wyniki"]}
          rows={[
            ["Nowe wyszukiwanie w sieci", num.format(stats.freeSources.web)],
            ["Pamięć wyników (24 h)", num.format(stats.freeSources.cache)],
            ["Katalog (SOURCE_MODE=catalog)", num.format(stats.freeSources.catalog)],
            ["Katalog: przekroczony dzienny limit AI", num.format(stats.freeSources.catalog_budget)],
            ["Katalog: limit 3 wyszukiwań na urządzenie", num.format(stats.freeSources.catalog_device)],
            ["Katalog: wyszukiwanie w sieci nie wyszło", num.format(stats.freeSources.catalog_fallback)],
            ["Wyniki sprzed zmiany (bez danych)", num.format(stats.freeSources.unknown)],
          ]}
        />
      </Section>

      <Section title="Koszt AI">
        <Table
          head={["Część", "Koszt (USD)", "Koszt (PLN)", "Na jednostkę"]}
          rows={[
            [
              "Darmowa (profil, wybór z katalogu lub wyszukiwanie w sieci)",
              usd.format(stats.ai.freeUsd),
              pln.format(stats.ai.freePln),
              `${stats.ai.freeCostPerResultPln === null ? "–" : plnPrecise.format(stats.ai.freeCostPerResultPln)} / wynik`,
            ],
            [
              "Płatna (Więcej propozycji: wyszukiwanie + dedykacje)",
              usd.format(stats.ai.paidUsd),
              pln.format(stats.ai.paidPln),
              `${stats.ai.avgPaidSearchPln === null ? "–" : plnPrecise.format(stats.ai.avgPaidSearchPln)} / płatne wyszukiwanie (${stats.ai.paidSearches})`,
            ],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {`Tokeny: ${num.format(stats.ai.tokens.input)} wejściowych, ${num.format(stats.ai.tokens.output)} wyjściowych · ` +
            `wyszukiwania: ${num.format(stats.ai.webSearches)} · pobrania stron: ${num.format(stats.ai.webFetches)} · ` +
            `ceny: $${AI_PRICES.inputPerMTok} / $${AI_PRICES.outputPerMTok} za mln tokenów, $${AI_PRICES.perWebSearch} za wyszukiwanie · ` +
            `kurs USD/PLN ${dec(stats.ai.usdPlnRate, 4)} (USD_PLN_RATE)`}
        </p>
      </Section>

      <Section title="Źródła (ref, utm_source)">
        <Table
          head={["Źródło", "Quizy", "Wyniki", "Ukończenia", "Kliknięcia", "Płatności", "Przychód", "Przychód / wynik"]}
          rows={stats.sources.map((row) => [
            row.source,
            num.format(row.starts),
            num.format(row.results),
            pct(row.completion),
            num.format(row.clicks),
            num.format(row.payments),
            pln.format(row.revenue),
            row.revenuePerResult === null ? "–" : plnPrecise.format(row.revenuePerResult),
          ])}
          empty="Brak danych w tym okresie."
        />
        <p className="text-xs text-muted-foreground">
          Link do filmu: <code>/?utm_source=tiktok_film12</code>. Wejścia z udostępnionych wyników mają źródło
          „ref:kod”.
        </p>
      </Section>

      <Section title="Top 20 produktów po kliknięciach">
        <Table
          head={["#", "Produkt", "Sklep", "Kliknięcia"]}
          rows={stats.topProducts.map((product, index) => [
            String(index + 1),
            product.name,
            product.merchant,
            num.format(product.clicks),
          ])}
          empty="Brak kliknięć w tym okresie."
        />
      </Section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty ?? "Brak danych."}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="whitespace-nowrap px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cn("px-3 py-2", cellIndex > 0 && "tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

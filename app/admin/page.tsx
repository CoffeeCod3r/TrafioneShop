import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { CheckLinksButton } from "@/components/admin/check-links-button";
import { AdminLoginForm, AdminLogoutButton } from "@/components/admin/login-form";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin/auth";
import { ERROR_LABELS, getCatalogHealth, getPoolHealth, type CatalogHealth, type PoolHealth } from "@/lib/admin/health";
import { describeCell } from "@/lib/catalog/labels";
import { MIN_GUIDE_PRODUCTS } from "@/lib/guides/products";
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
  const [stats, health, pool] = await Promise.all([getAdminStats(period), getCatalogHealth(), getPoolHealth()]);
  return <Dashboard stats={stats} health={health} pool={pool} period={period} />;
}

const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });
const RUN_STATUS: Record<string, string> = { running: "trwa", completed: "zakończone", partial: "przerwane po 20 min (reszta w przyszłym tygodniu)", failed: "błąd" };

function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

const NIGHTLY_STATUS: Record<string, string> = {
  running: "trwa",
  completed: "zakończone",
  stopped_budget: "przerwane: limit kosztów AI",
  failed: "błąd",
};
const THIN_CELLS_SHOWN = 40;

function PoolSection({ pool }: { pool: PoolHealth }) {
  const run = pool.lastRun;
  const { counts } = pool;
  return (
    <Section title="Pula">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Aktywne"
          value={num.format(counts.active)}
          hint={`w tym nieodświeżone > 7 dni (klienci ich nie widzą): ${num.format(counts.stale_active)}`}
        />
        <Tile label="Broken" value={num.format(counts.broken)} hint="2 porażki z rzędu (404, 410, strona główna, brak odpowiedzi)" />
        <Tile label="Out of stock" value={num.format(counts.out_of_stock)} hint={`oczekujące na weryfikację: ${num.format(counts.pending)}`} />
        <Tile
          label="Ostatni nocny przebieg"
          value={run ? dateTime.format(new Date(run.started_at)) : "jeszcze nie było"}
          hint={
            run
              ? `${NIGHTLY_STATUS[run.status] ?? run.status} · ${run.trigger === "schedule" ? "automat" : "ręcznie"} · czas ${duration(run.duration_ms === null ? null : Math.round(run.duration_ms / 1000))}`
              : "automat: codziennie ok. 3:00 (GitHub Actions)"
          }
        />
        <Tile label="Koszt AI ostatniej nocy" value={run ? `$${run.ai_cost_usd.toFixed(2)}` : "–"} hint={run ? `${num.format(run.ai_calls)} zapytań` : undefined} />
        <Tile
          label="Dodane ostatniej nocy"
          value={run ? num.format(run.added) : "–"}
          hint={
            run
              ? `sprawdzono ${num.format(run.checked)} · broken ${num.format(run.broken)} · out of stock ${num.format(run.out_of_stock)} · zmiany cen ${num.format(run.price_changes)}`
              : undefined
          }
        />
      </div>

      <h3 className="mt-2 font-semibold">
        Komórki poniżej progu ({num.format(pool.thinCells.length)} z {num.format(pool.cellsTotal)}, próg: {pool.threshold} produktów)
      </h3>
      {pool.thinCells.length === 0 ? (
        <p className="text-sm text-muted-foreground">Każda komórka (kategoria × cena × odbiorca) ma wystarczająco produktów.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {pool.thinCells.slice(0, THIN_CELLS_SHOWN).map((cell) => {
              const label = describeCell(cell);
              return (
                <li
                  key={`${cell.category}|${cell.price_bucket}|${cell.recipient}`}
                  className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800"
                >
                  {label.category} · {label.price} · {label.recipient}: <strong>{cell.active_count}</strong>
                </li>
              );
            })}
          </ul>
          {pool.thinCells.length > THIN_CELLS_SHOWN && (
            <p className="text-xs text-muted-foreground">
              …i jeszcze {num.format(pool.thinCells.length - THIN_CELLS_SHOWN)} (najpustsze są na górze).
            </p>
          )}
        </>
      )}
      {run && Object.keys(run.notes as object).length > 0 && (
        <p className="text-xs text-muted-foreground">Uwagi z ostatniego przebiegu: {JSON.stringify(run.notes)}</p>
      )}
    </Section>
  );
}

function CatalogHealthSection({ health }: { health: CatalogHealth }) {
  const run = health.lastRun;
  return (
    <Section title="Zdrowie katalogu">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Produkty dostępne" value={num.format(health.available)} />
        <Tile label="Produkty niedostępne" value={num.format(health.unavailable)} hint="nie pokazujemy ich na kartach" />
        <Tile
          label="Ostatnie sprawdzenie"
          value={run ? dateTime.format(new Date(run.started_at)) : "jeszcze nie było"}
          hint={run ? `${RUN_STATUS[run.status] ?? run.status} · ${run.started_by === "cron" ? "automat (niedziela 3:00)" : "ręcznie"} · czas ${duration(health.durationSec)}` : "automat: co niedzielę o 3:00"}
        />
        <Tile
          label="Zmiany cen (ostatnie sprawdzenie)"
          value={run ? num.format(run.price_changes) : "–"}
          hint={run ? `sprawdzono ${num.format(run.processed)} z ${num.format(run.total)} · w porządku: ${num.format(run.ok)} · nowo niedostępne: ${num.format(run.became_unavailable)}` : undefined}
        />
        <Tile
          label="Pominięte (robots.txt / brak danych)"
          value={run ? `${num.format(run.skipped_robots)} / ${num.format(run.unverified)}` : "–"}
          hint="to nie błędy: strony bez ceny w kodzie zostają bez zmian"
        />
        <Tile label="Błędy sieci (ostatnie sprawdzenie)" value={run ? num.format(run.errors) : "–"} hint="niedostępny dopiero po 2 błędach z rzędu" />
      </div>

      <CheckLinksButton running={health.running} />

      <h3 className="mt-2 font-semibold">Najczęstsze błędy według sklepu</h3>
      <Table
        head={["Sklep", "Błąd", "Liczba"]}
        rows={health.errors.map((row) => [row.shop, ERROR_LABELS[row.kind] ?? row.kind, num.format(row.count)])}
        empty="Brak błędów w ostatnim sprawdzeniu."
      />

      <h3 className="mt-2 font-semibold">Poradniki do uzupełnienia</h3>
      <Table
        head={["Poradnik", "Produktów"]}
        rows={health.guidesToComplete.map((guide) => [guide.title, `${guide.count} (min. ${MIN_GUIDE_PRODUCTS})`])}
        empty="Każdy poradnik ma co najmniej 6 dostępnych produktów."
      />
      {health.guidesToComplete.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Poradnik jest uzupełniany z katalogu (ta sama kategoria i budżet) bez wyszukiwania w sieci. Jeśli to za mało,
          trzeba odświeżyć go ręcznie: <code>npm run guides:refresh</code>.
        </p>
      )}
    </Section>
  );
}

function Dashboard({ stats, health, pool, period }: { stats: AdminStats; health: CatalogHealth; pool: PoolHealth; period: Period }) {
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

      <PoolSection pool={pool} />

      <CatalogHealthSection health={health} />

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

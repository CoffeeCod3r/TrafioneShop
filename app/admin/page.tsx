import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { CheckLinksButton } from "@/components/admin/check-links-button";
import { AdminLoginForm, AdminLogoutButton } from "@/components/admin/login-form";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin/auth";
import { ERROR_LABELS, getCatalogHealth, type CatalogHealth } from "@/lib/admin/health";
import { MIN_GUIDE_PRODUCTS } from "@/lib/guides/products";
import { AI_PRICES, getAdminStats, PERIODS, type AdminStats, type Period } from "@/lib/admin/stats";
import { isMockMode } from "@/lib/mode";
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
  const [stats, health] = await Promise.all([getAdminStats(period), getCatalogHealth()]);
  return <Dashboard stats={stats} health={health} period={period} />;
}

const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });
const RUN_STATUS: Record<string, string> = { running: "trwa", completed: "zakończone", partial: "przerwane po 20 min (reszta w przyszłym tygodniu)", failed: "błąd" };

function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

const NIGHTLY_WORKFLOW_URL = "https://github.com/CoffeeCod3r/TrafioneShop/actions/workflows/nightly-catalog.yml";
const BAND_LABEL: Record<string, string> = { "do 50": "do 50 zł", "50-100": "50–100", "100-200": "100–200", "200+": "200+" };

function PoolSection({ pool }: { pool: CatalogHealth["pool"] }) {
  const nightly = pool.lastNightly;
  const nightlyDetails = (nightly?.details ?? {}) as { budgetExceeded?: boolean; tagged?: number };
  return (
    <Section title="Pula produktów">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Aktywne" value={num.format(pool.counts.active ?? 0)} hint="sprawdzone, w sprzedaży" />
        <Tile label="Czekają na sprawdzenie" value={num.format(pool.counts.pending ?? 0)} />
        <Tile label="Brak w magazynie" value={num.format(pool.counts.out_of_stock ?? 0)} hint="sprawdzane dalej, mogą wrócić" />
        <Tile label="Usunięte (broken)" value={num.format(pool.counts.broken ?? 0)} hint="2 błędy z rzędu, nie pokazujemy" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Komórki pokrycia (min. 8)"
          value={`${num.format(pool.healthyCells)} / ${num.format(pool.totalCells)}`}
          hint="kategoria × cena × odbiorca, aktywne sprawdzone w 7 dni"
        />
        <Tile
          label="Ostatnia noc"
          value={nightly ? dateTime.format(new Date(nightly.started_at)) : "jeszcze nie było"}
          hint={
            nightly
              ? `${RUN_STATUS[nightly.status] ?? nightly.status} · dodane ${num.format(nightly.added)} · otagowane ${num.format(nightlyDetails.tagged ?? 0)}`
              : "GitHub Actions: codziennie ok. 3:00"
          }
        />
        <Tile
          label="Koszt AI ostatniej nocy"
          value={nightly ? `$${Number(nightly.ai_cost_usd).toFixed(4)}` : "–"}
          hint={nightlyDetails.budgetExceeded ? "limit NIGHTLY_AI_BUDGET_USD osiągnięty" : "limit NIGHTLY_AI_BUDGET_USD"}
        />
      </div>
      {pool.grid.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Kategoria</th>
                {pool.grid[0].bands.map((band) => (
                  <th key={band.band} className="whitespace-nowrap px-3 py-2 font-medium">
                    {BAND_LABEL[band.band] ?? band.band}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pool.grid.map((row) => (
                <tr key={row.category}>
                  <td className="px-3 py-2">{row.category}</td>
                  {row.bands.map((band) => (
                    <td
                      key={band.band}
                      className={cn("px-3 py-2 tabular-nums", band.healthy < band.total ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800")}
                    >
                      {band.healthy}/{band.total}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Liczba w komórce: ilu odbiorców (z 7) ma co najmniej 8 aktywnych produktów w tej kategorii i cenie. Czerwone
        komórki uzupełnia nocny przebieg (do 10 na noc).
      </p>
    </Section>
  );
}

function WarmupSection({ warmup }: { warmup: CatalogHealth["warmup"] }) {
  const run = warmup.lastRun;
  const details = (run?.details ?? {}) as { healthyBefore?: number; healthyAfter?: number; budgetExceeded?: boolean };
  return (
    <Section title="Rozgrzanie">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Zdrowe kombinacje quizu"
          value={warmup.total > 0 ? `${Math.round((warmup.healthy / warmup.total) * 100)}%` : "–"}
          hint={`${num.format(warmup.healthy)} z ${num.format(warmup.total)} · gotowe wyniki ważne teraz: ${num.format(warmup.live)}`}
        />
        <Tile
          label="Ostatnie rozgrzanie"
          value={run ? dateTime.format(new Date(run.started_at)) : "jeszcze nie było"}
          hint={run ? `zdrowe ${details.healthyBefore ?? "–"} -> ${details.healthyAfter ?? "–"} · dodane ${num.format(run.added)}` : "npm run catalog:warmup"}
        />
        <Tile
          label="Koszt rozgrzania"
          value={run ? `$${Number(run.ai_cost_usd).toFixed(4)}` : "–"}
          hint={details.budgetExceeded ? "limit WARMUP_AI_BUDGET_USD osiągnięty" : "limit WARMUP_AI_BUDGET_USD (2,00)"}
        />
      </div>
      <Table
        head={["Niezdrowa kombinacja", "Kandydaci (min. 15)", "Kategorie w top 5 (min. 3)"]}
        rows={warmup.unhealthy.map((row) => [row.label, num.format(row.candidates), num.format(row.categories)])}
        empty={warmup.total > 0 ? "Wszystkie kombinacje są zdrowe." : "Rozgrzanie jeszcze nie było uruchomione."}
      />
      <p className="text-xs text-muted-foreground">
        Quiz bez zdjęcia i opisu, którego odbiorca, budżet i jedno z zainteresowań pasują do zdrowej kombinacji, dostaje
        gotowe 5 produktów od razu, bez AI. Listę kombinacji edytujesz w lib/catalog/warmup-combos.ts.
      </p>
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

      {isMockMode() ? (
        <CheckLinksButton running={health.running} />
      ) : (
        <a
          href={NIGHTLY_WORKFLOW_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 px-5 font-semibold sm:w-auto"
        >
          Sprawdź linki teraz (GitHub Actions)
        </a>
      )}

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

function Dashboard({ stats, health, period }: { stats: AdminStats; health: CatalogHealth; period: Period }) {
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
            ["Gotowe wyniki rozgrzanych kombinacji (bez AI)", num.format(stats.freeSources.warm)],
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
            [
              "Pula (nocne uzupełnianie i tagi)",
              usd.format(stats.ai.poolUsd),
              pln.format(stats.ai.poolUsd * stats.ai.usdPlnRate),
              "limit NIGHTLY_AI_BUDGET_USD na noc",
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

      <PoolSection pool={health.pool} />

      <WarmupSection warmup={health.warmup} />

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

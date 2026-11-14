/**
 * Seeds 50 sample products for local testing (network = "seed").
 *
 *   npm run seed              # upsert into Supabase from .env.local
 *   npm run seed -- --dry-run # print what would be inserted
 *
 * Safe to run repeatedly: upserts by (network, external_id).
 */
import { parseArgs } from "node:util";

import { normalizeProduct, type ProductUpsert } from "../lib/feeds/normalize.ts";
import { supabaseProductStore } from "../lib/feeds/store.ts";
import { createScriptDb } from "./script-db.ts";

const NETWORK = "seed";

// [name, category, price PLN, merchant]
const SAMPLES: [string, string, number, string][] = [
  ["Młynek do kawy ręczny ceramiczny", "Kuchnia > Akcesoria do kawy", 129.0, "Kawowy Zakątek"],
  ["Kawa ziarnista Etiopia 1 kg", "Żywność > Kawa", 89.99, "Kawowy Zakątek"],
  ["Drip do kawy V60 z filtrami", "Kuchnia > Akcesoria do kawy", 75.5, "Kawowy Zakątek"],
  ["Zestaw herbat liściastych w puszkach", "Żywność > Herbata", 64.0, "Herbaciarnia Liść"],
  ["Zaparzacz do herbaty szklany", "Kuchnia > Herbata", 49.9, "Herbaciarnia Liść"],
  ["Nóż szefa kuchni 20 cm", "Kuchnia > Noże kuchenne", 249.0, "KuchniaPro"],
  ["Forma do pieczenia chleba z pokrywą", "Kuchnia > Pieczenie", 119.0, "KuchniaPro"],
  ["Zestaw przypraw z całego świata", "Żywność > Przyprawy", 59.0, "KuchniaPro"],
  ["Karafka do wina z dekanterem", "Dom > Akcesoria do wina", 139.0, "Szkło i Dom"],
  ["Zestaw do warzenia piwa w domu", "Hobby > Piwo domowe", 229.0, "Browar w Domu"],
  ["Pralinki ręcznie robione 24 szt.", "Żywność > Słodycze > Czekolada", 79.0, "Czekoladownia"],
  ["Gra planszowa strategiczna dla 2–4 osób", "Gry > Gry planszowe", 159.0, "Planszomania"],
  ["Gra karciana imprezowa", "Gry > Gry towarzyskie", 49.0, "Planszomania"],
  ["Puzzle 1000 elementów – mapa świata", "Zabawki > Puzzle", 59.99, "Planszomania"],
  ["Pad bezprzewodowy do konsoli", "Elektronika > Gaming > Pady", 279.0, "GameStrefa"],
  ["Czytnik e-booków 6 cali", "Elektronika > Czytniki e-book", 549.0, "TechSklep"],
  ["Powieść fantasy – tom 1 w twardej oprawie", "Książki > Fantastyka", 54.9, "Księgarnia Strona"],
  ["Poradnik fotografii dla początkujących", "Książki > Poradniki > Fotografia", 69.0, "Księgarnia Strona"],
  ["Manga – tom 1 serii przygodowej", "Książki > Komiksy > Manga", 29.99, "Księgarnia Strona"],
  ["Gramofon walizkowy z Bluetooth", "Elektronika > Audio > Gramofony", 399.0, "TechSklep"],
  ["Słuchawki bezprzewodowe nauszne", "Elektronika > Audio > Słuchawki", 349.0, "TechSklep"],
  ["Głośnik Bluetooth wodoodporny", "Elektronika > Audio > Głośniki", 199.0, "TechSklep"],
  ["Powerbank 20 000 mAh", "Elektronika > Akcesoria GSM > Powerbanki", 119.0, "TechSklep"],
  ["Smartwatch z pomiarem tętna", "Elektronika > Smartwatche", 499.0, "TechSklep"],
  ["Aparat natychmiastowy z wkładem", "Elektronika > Fotografia > Aparaty", 429.0, "FotoŚwiat"],
  ["Inteligentna żarówka RGB", "Elektronika > Smart home > Oświetlenie", 69.0, "TechSklep"],
  ["Pas do biegania na telefon", "Sport > Bieganie > Akcesoria", 59.0, "SportMax"],
  ["Lampka rowerowa LED zestaw", "Sport > Rowery > Oświetlenie", 89.0, "SportMax"],
  ["Mata do jogi antypoślizgowa", "Sport > Joga > Maty", 129.0, "SportMax"],
  ["Hantle regulowane 2 × 10 kg", "Sport > Fitness > Hantle", 299.0, "SportMax"],
  ["Kijki trekkingowe składane", "Turystyka > Trekking > Kijki", 179.0, "Górski Outlet"],
  ["Plecak turystyczny 30 l", "Turystyka > Plecaki", 249.0, "Górski Outlet"],
  ["Hamak kempingowy z moskitierą", "Turystyka > Kemping > Hamaki", 139.0, "Górski Outlet"],
  ["Organizer podróżny na kable", "Podróże > Akcesoria podróżne", 45.0, "Walizkownia"],
  ["Koc z mikrofibry 150 × 200 cm", "Dom > Tekstylia > Koce i pledy", 99.0, "Przytulny Dom"],
  ["Plakat minimalistyczny w ramce", "Dom > Dekoracje > Plakaty", 89.0, "Przytulny Dom"],
  ["Wazon ceramiczny w stylu skandynawskim", "Dom > Dekoracje > Wazony", 79.0, "Przytulny Dom"],
  ["Zestaw do uprawy ziół na parapecie", "Ogród > Rośliny > Zestawy do uprawy", 69.0, "Zielony Parapet"],
  ["Doniczka samonawadniająca", "Ogród > Rośliny > Doniczki", 49.0, "Zielony Parapet"],
  ["Zestaw wkrętaków precyzyjnych 60 el.", "Narzędzia > Narzędzia ręczne > Wkrętaki", 109.0, "Majster.pl"],
  ["Organizer do samochodu na fotel", "Motoryzacja > Akcesoria samochodowe", 59.0, "AutoDodatki"],
  ["Zestaw kosmetyków do pielęgnacji twarzy", "Uroda > Pielęgnacja twarzy", 149.0, "Piękna Strona"],
  ["Woda perfumowana 50 ml – nuty drzewne", "Uroda > Perfumy", 219.0, "Piękna Strona"],
  ["Bransoletka srebrna z grawerem", "Biżuteria > Bransoletki > Personalizowane", 189.0, "Srebrna Nić"],
  ["Zegarek klasyczny ze skórzanym paskiem", "Moda > Zegarki", 359.0, "Czas i Styl"],
  ["Portfel skórzany męski", "Moda > Torby i portfele", 149.0, "Czas i Styl"],
  ["Świeca sojowa o zapachu lasu", "Dom > Świece i zapachy", 59.0, "Przytulny Dom"],
  ["Zestaw do kąpieli spa", "Uroda > Kąpiel > Zestawy spa", 99.0, "Piękna Strona"],
  ["Drapak dla kota z budką", "Zwierzęta > Koty > Drapaki", 199.0, "Zoo Dom"],
  ["Planer roczny w twardej oprawie", "Biuro > Kalendarze i planery", 69.0, "Papierowe Love"],
];

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

  const rows: ProductUpsert[] = SAMPLES.map(([name, category, price, merchant], index) => {
    const externalId = `seed-${String(index + 1).padStart(3, "0")}`;
    const result = normalizeProduct(
      {
        externalId,
        name,
        description: `Przykładowy produkt do testów: ${name}.`,
        price: price.toFixed(2),
        currency: "PLN",
        category,
        imageUrl: `https://placehold.co/600x600/png?text=${encodeURIComponent(name.slice(0, 30))}`,
        url: `https://example.com/produkt/${externalId}`,
        merchant,
        inStock: true,
      },
      NETWORK,
      "example.com",
    );
    if (!result.ok) throw new Error(`Seed product ${externalId} rejected: ${result.reason}`);
    return result.product;
  });

  const untagged = rows.filter((row) => !row.tags?.length).map((row) => row.name);
  const tagCounts = new Map<string, number>();
  for (const row of rows) for (const tag of row.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  console.log(`Seed products: ${rows.length}, distinct tags: ${tagCounts.size}`);
  if (untagged.length > 0) console.log(`Without tags: ${untagged.join(", ")}`);

  if (values["dry-run"]) {
    console.table(rows.map((row) => ({ id: row.external_id, price: row.price_pln, tags: row.tags?.join(", ") })));
    return;
  }

  await supabaseProductStore(createScriptDb()).upsert(rows);
  console.log(`Upserted ${rows.length} products with network "${NETWORK}".`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/**
 * Test of the unified product card and of the category -> illustration mapping.
 *
 *   npm run test:cards            (needs `npm run dev` or `npm start` with MOCK_MODE=true on BASE_URL, default :3000)
 *
 * Part 1 needs no server: every category has an existing, small SVG with no text, unknown categories fall back.
 * Part 2 loads /demo-karty (a MOCK_MODE-only page with a card per category) and checks the HTML.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const { getIllustration, ILLUSTRATION_CATEGORIES, GENERIC_ILLUSTRATION } = await import("../lib/illustrations.ts");

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}

console.log("\nMapowanie kategorii -> ilustracja");
for (const category of [...ILLUSTRATION_CATEGORIES, "prezent"]) {
  const file = path.join("public", "illustrations", `${category}.svg`);
  const exists = existsSync(file);
  const size = exists ? statSync(file).size : 0;
  const svg = exists ? readFileSync(file, "utf8") : "";
  check(exists && size <= 5 * 1024, `${category}: plik istnieje, ${size} B (limit 5 KB)`);
  check(!/<text|<image|<style|<script/i.test(svg), `${category}: bez tekstu, obrazów, skryptów`);
}
check(getIllustration("Kuchnia > Akcesoria").src === "/illustrations/kuchnia.svg", "„Kuchnia > Akcesoria” -> kuchnia");
check(getIllustration("Podróże").src === "/illustrations/podroze.svg", "„Podróże” (polskie znaki) -> podroze");
check(getIllustration("turystyka").src === "/illustrations/podroze.svg", "alias: turystyka -> podróże");
check(getIllustration("zabawki").src === "/illustrations/gry.svg", "alias: zabawki -> gry");
check(getIllustration("cos-nowego").src === GENERIC_ILLUSTRATION.src, "nieznana kategoria -> ogólne pudełko");
check(getIllustration(null).src === GENERIC_ILLUSTRATION.src && getIllustration("").src === GENERIC_ILLUSTRATION.src, "brak kategorii -> ogólne pudełko");
check(ILLUSTRATION_CATEGORIES.every((c) => getIllustration(c).alt.startsWith("Ilustracja: ")), "każdy alt zaczyna się od „Ilustracja: ”");

const base = process.env.BASE_URL ?? "http://localhost:3000";
console.log(`\nKarty na stronie ${base}/demo-karty`);
let html = "";
try {
  const response = await fetch(`${base}/demo-karty`);
  // Only the markup: the page also carries its data in <script> tags, which would double every match.
  html = (await response.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!-- -->/g, "");
  check(response.ok, `strona odpowiada (${response.status})`);
} catch {
  check(false, "serwer nie odpowiada (uruchom npm run dev z MOCK_MODE=true)");
}
if (html) {
  const cards = html.match(/<li\b[^>]*class="[^"]*rounded-2xl/g) ?? [];
  check(cards.length === ILLUSTRATION_CATEGORIES.length + 3, `liczba kart: ${cards.length} (12 kategorii + nieznana + brak + zdjęcie z feedu)`);
  for (const category of ILLUSTRATION_CATEGORIES) {
    check(html.includes(`illustrations%2F${category}.svg`) || html.includes(`/illustrations/${category}.svg`), `karta kategorii ${category} ma swoją ilustrację`);
  }
  check((html.match(/prezent\.svg/g) ?? []).length >= 2, "nieznana kategoria i brak kategorii: ogólne pudełko");
  check((html.match(/Zobacz w sklepie/g) ?? []).length === cards.length, "każda karta ma przycisk „Zobacz w sklepie”");
  check((html.match(/rel="sponsored nofollow noopener"/g) ?? []).length === cards.length, "każdy link: rel=sponsored nofollow, nowa karta");
  check((html.match(/cena sprawdzona 22 lis/g) ?? []).length === cards.length, "data sprawdzenia: „cena sprawdzona 22 lis”");
  check((html.match(/loading="lazy"/g) ?? []).length >= cards.length, "obrazki ładowane leniwie");
  check((html.match(/alt="Ilustracja: /g) ?? []).length >= cards.length - 1, "alt ilustracji zaczyna się od „Ilustracja: ”");
}

console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

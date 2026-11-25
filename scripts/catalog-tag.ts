/**
 * Gives interest tags to products that have none, by the category/name rules (lib/tags.ts). No AI.
 *
 *   npm run catalog:tag
 */
import { tagProducts } from "../lib/catalog/tag.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

console.log(`Baza: ${isRealService("db") ? "Supabase" : "plik demo"}`);
const summary = await tagProducts(getRepos());
console.log(`Bez tagów: ${summary.checked} · otagowano ${summary.tagged} · nie da się otagować ${summary.untaggable}`);

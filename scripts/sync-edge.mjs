// Copies the portable search core and its few dependencies next to the Edge Function, because the
// Supabase CLI bundles only files inside supabase/functions. The copies are generated (git-ignored):
// run this before every `supabase functions deploy run-search --no-verify-jwt` (or use `npm run edge:deploy`).
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const FILES = [
  "lib/search/core.ts",
  "lib/paid/schema.ts",
  "lib/prompts.ts",
  "lib/tags.ts",
  "lib/quiz/schema.ts",
  "lib/db.ts",
];
const target = path.join("supabase", "functions", "_shared");

await rm(target, { recursive: true, force: true });
for (const file of FILES) {
  const destination = path.join(target, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(file, destination);
}
console.log(`Copied ${FILES.length} files to ${target}`);

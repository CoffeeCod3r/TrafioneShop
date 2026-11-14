import type { ProductsRepo } from "../services/db.ts";

/**
 * What the feed importer needs from storage. Satisfied by getRepos().products
 * (Supabase or demo file), or by a stub for dry runs and tests.
 */
export type ProductStore = Pick<ProductsRepo, "upsertMany" | "listInStockExternalIds" | "markOutOfStock">;

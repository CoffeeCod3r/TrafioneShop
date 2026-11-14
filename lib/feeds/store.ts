import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db.ts";
import type { ProductUpsert } from "./normalize.ts";

/** Storage used by the importer. Abstracted so the import logic can be tested without a database. */
export type ProductStore = {
  upsert(rows: ProductUpsert[]): Promise<void>;
  listInStockExternalIds(network: string): Promise<string[]>;
  markOutOfStock(network: string, externalIds: string[]): Promise<void>;
};

const UPSERT_CHUNK = 500;
const PAGE_SIZE = 1000;
const UPDATE_CHUNK = 200;

export function supabaseProductStore(db: SupabaseClient<Database>): ProductStore {
  return {
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const { error } = await db
          .from("products")
          .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "network,external_id" });
        if (error) throw new Error(`Upsert failed: ${error.message}`);
      }
    },

    async listInStockExternalIds(network) {
      const ids: string[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .from("products")
          .select("external_id")
          .eq("network", network)
          .eq("in_stock", true)
          .order("external_id")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`Listing products failed: ${error.message}`);
        ids.push(...data.map((row) => row.external_id));
        if (data.length < PAGE_SIZE) return ids;
      }
    },

    async markOutOfStock(network, externalIds) {
      for (let i = 0; i < externalIds.length; i += UPDATE_CHUNK) {
        const { error } = await db
          .from("products")
          .update({ in_stock: false })
          .eq("network", network)
          .in("external_id", externalIds.slice(i, i + UPDATE_CHUNK));
        if (error) throw new Error(`Marking out of stock failed: ${error.message}`);
      }
    },
  };
}

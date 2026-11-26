import type { Repos } from "../services/db.ts";
import type { CheckStore } from "./runner.ts";

/** The check's store backed by the app's repositories (demo JSON or Supabase). Used by the app, scripts and tests. */
export function createRepoStore(repos: Repos, extraDomains: string[] = []): CheckStore {
  return {
    listProducts: async () =>
      (await repos.catalog.listCheckable()).map((product) => ({
        id: product.id,
        name: product.name,
        url: product.url,
        affiliate_url: product.affiliate_url,
        price_pln: product.price_pln,
        network: product.network,
        failed_checks: product.failed_checks,
        status: product.status,
        last_check_at: product.last_check_at,
      })),
    listShopDomains: async () => [...(await repos.allowedShops.listActive()).map((shop) => shop.domain), ...extraDomains],
    applyCheck: (productId, patch, history) => repos.catalog.applyCheck(productId, patch, history),
    getRun: (id) => repos.catalog.getRun(id),
    updateRun: (id, patch) => repos.catalog.updateRun(id, patch),
  };
}

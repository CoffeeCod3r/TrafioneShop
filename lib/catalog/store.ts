import type { Repos } from "../services/db.ts";
import type { VerifyStore } from "./verify.ts";

/** The verifier's store backed by the app's repositories (Supabase or the demo JSON file). */
export function createVerifyStore(repos: Repos): VerifyStore {
  return {
    list: (options) => repos.catalog.listForVerify(options),
    apply: (productId, patch, history) => repos.catalog.applyVerification(productId, patch, history),
  };
}

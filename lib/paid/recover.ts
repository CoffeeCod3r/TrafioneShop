import { logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";
import { refundPurchase } from "@/lib/web-search";

/**
 * A paid search must finish within the function limit (300 s). If it is still "pending"/"searching"
 * 10 minutes after payment, the background job was killed (timeout, deploy, crash): refund it.
 */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

export async function recoverStuckPayment(resultId: string): Promise<boolean> {
  const repos = getRepos();
  const result = await repos.results.getById(resultId);
  if (!result || (result.paid_status !== "pending" && result.paid_status !== "searching")) return false;

  const purchases = await repos.purchases.listByResult(resultId);
  const stuck = purchases.find(
    (purchase) => purchase.status === "paid" && Date.now() - new Date(purchase.created_at).getTime() > STUCK_AFTER_MS,
  );
  if (!stuck) return false;

  logEvent("paid.stuck_recovered");
  await refundPurchase(stuck, "stuck_timeout");
  return true;
}

/** Daily sweep for stuck payments from the last 2 days (in case nobody keeps the page open). */
export async function recoverStuckPayments(): Promise<number> {
  const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const purchases = await getRepos().purchases.listSince(since);
  let recovered = 0;
  for (const resultId of new Set(purchases.filter((p) => p.status === "paid").map((p) => p.result_id))) {
    if (resultId && (await recoverStuckPayment(resultId))) recovered++;
  }
  return recovered;
}

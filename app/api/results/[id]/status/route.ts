import { describeError, logEvent } from "@/lib/log";
import { recoverStuckPayment } from "@/lib/paid/recover";
import { recoverStuckFreeSearch } from "@/lib/search/job";
import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/results/[id]/status – lightweight polling (every 3 s) for the free search (searchStatus)
 * and the paid search (paidStatus).
 * Also rescues a search whose background job died: a paid one is refunded (10 min after payment),
 * a free one is finished from the catalog (5 min after it started).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const repos = getRepos();
  let result = await repos.results.getById(id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });

  if (result.search_status === "searching") {
    try {
      if (await recoverStuckFreeSearch(id)) result = await repos.results.getById(id);
    } catch (error) {
      logEvent("free.recover_failed", describeError(error));
    }
  }
  if (result?.paid_status === "pending" || result?.paid_status === "searching") {
    try {
      if (await recoverStuckPayment(id)) result = await repos.results.getById(id);
    } catch (error) {
      logEvent("paid.recover_failed", describeError(error));
    }
  }
  return Response.json(
    { paidStatus: result?.paid_status ?? "none", searchStatus: result?.search_status ?? "ready" },
    { headers: { "cache-control": "no-store" } },
  );
}

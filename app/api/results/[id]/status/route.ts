import { describeError, logEvent } from "@/lib/log";
import { recoverStuckPayment } from "@/lib/paid/recover";
import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/results/[id]/status – lightweight polling for the paid search status.
 * Also refunds a payment whose background search died (still running 10 min after payment).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const repos = getRepos();
  let result = await repos.results.getById(id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });

  if (result.paid_status === "pending" || result.paid_status === "searching") {
    try {
      if (await recoverStuckPayment(id)) result = await repos.results.getById(id);
    } catch (error) {
      logEvent("paid.recover_failed", describeError(error));
    }
  }
  return Response.json({ paidStatus: result?.paid_status ?? "none" }, { headers: { "cache-control": "no-store" } });
}

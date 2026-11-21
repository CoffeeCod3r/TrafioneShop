import { describeError, logEvent } from "@/lib/log";
import { webPickSchema } from "@/lib/paid/schema";
import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /go/w/[resultId]/[index] – outbound link for a paid web pick.
 * Records the click (source "paid-web", no product_id) and redirects (302) to the stored
 * outbound URL (affiliate deeplink when the shop has one). Only stored, verified URLs are used.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string; index: string }> },
) {
  const { resultId, index } = await params;
  const home = new URL("/", request.url);
  const position = Number(index);
  if (!UUID.test(resultId) || !Number.isInteger(position) || position < 0 || position > 50) {
    return Response.redirect(home, 302);
  }

  const repos = getRepos();
  const result = await repos.results.getById(resultId).catch(() => null);
  const picks = Array.isArray(result?.web_picks) ? result.web_picks : [];
  const pick = webPickSchema.safeParse(picks[position]);
  if (!result || result.paid_status !== "ready" || !pick.success) return Response.redirect(home, 302);

  const target = new URL(pick.data.outboundUrl, request.url);
  try {
    await repos.clicks.create({ result_id: resultId, product_id: null, url: target.toString(), source: "paid-web" });
  } catch (error) {
    logEvent("click.save_failed", describeError(error));
  }

  return new Response(null, {
    status: 302,
    headers: { location: target.toString(), "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

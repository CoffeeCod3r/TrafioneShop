import { describeError, logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /go/[productId]?r=[resultId][&src=share]
 * Records the click and redirects (302) to the product's affiliate_url.
 * source = "share" when the result page was opened from a shared link (?ref=), otherwise "free".
 * Only redirects to URLs stored in our catalog, so it cannot be used as an open redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const home = new URL("/", request.url);
  if (!UUID.test(productId)) return Response.redirect(home, 302);

  const repos = getRepos();
  const product = await repos.products.getById(productId).catch(() => null);
  if (!product) return Response.redirect(home, 302);

  const query = new URL(request.url).searchParams;
  const resultId = query.get("r");
  const source = query.get("src") === "share" ? "share" : "free";
  const target = new URL(product.affiliate_url, request.url);

  try {
    await repos.clicks.create({
      result_id: resultId && UUID.test(resultId) ? resultId : null,
      product_id: product.id,
      url: target.toString(),
      source,
    });
  } catch (error) {
    // Never block the redirect because of analytics (e.g. unknown result_id).
    logEvent("click.save_failed", describeError(error));
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
      // Keep affiliate redirects out of search indexes.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

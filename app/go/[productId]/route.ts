import { describeError, logEvent } from "@/lib/log";
import { affiliateNetworkDomains, hostMatches, safeOutboundUrl } from "@/lib/outbound";
import { toOutboundUrl } from "@/lib/search/core";
import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /go/[productId]?r=[resultId][&src=share]
 * Records the click and redirects (302) to the product's affiliate_url.
 * Click source: "share" when the page was opened from a shared link (?src=share); otherwise "free-web" for
 * products found by the web search (network "direct") and "catalog" for partner catalog products.
 * Web products in a shop that has an affiliate deeplink (allowed_shops.has_affiliate + deeplink_template)
 * lead through that deeplink; today none has one, so they lead straight to the shop.
 * Only redirects to URLs stored in our catalog (never one from the request), and only to https hosts that are
 * an allowed shop or an affiliate network, so it cannot be used as an open redirect.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const home = new URL("/", request.url);
  if (!UUID.test(productId)) return Response.redirect(home, 302);

  const repos = getRepos();
  const product = await repos.products.getById(productId).catch(() => null);
  if (!product) return Response.redirect(home, 302);

  const query = new URL(request.url).searchParams;
  const resultId = query.get("r");
  const direct = product.network === "direct";
  const source = query.get("src") === "share" ? "share" : direct ? "free-web" : "catalog";
  const shops = await repos.allowedShops.listActive().catch(() => []);
  let destination = product.affiliate_url;
  if (direct && product.url) {
    const host = hostOf(product.url);
    const shop = shops.find((item) => hostMatches(host, item.domain));
    destination = shop ? toOutboundUrl(product.url, shop) : product.url;
  }
  const target = safeOutboundUrl(destination, request.url, [...shops.map((shop) => shop.domain), ...affiliateNetworkDomains()]);
  if (!target) {
    logEvent("click.blocked_destination", { network: product.network, host: hostOf(destination) || "invalid" });
    return Response.redirect(home, 302);
  }

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

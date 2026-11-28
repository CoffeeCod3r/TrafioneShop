import { revalidateTag } from "next/cache";

import { getEnv } from "@/lib/env";
import { hasCronSecret } from "@/lib/secret";
import { GUIDES_CACHE_TAG } from "@/lib/guides/products";

/**
 * POST /api/revalidate-guides (header x-internal-secret = CRON_SECRET) – called after the weekly
 * `npm run guides:refresh` so the static guide pages pick up the new products at once.
 * Without the call they refresh on their own within a week.
 */
export async function POST(request: Request) {
  if (!hasCronSecret(request, getEnv().CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  revalidateTag(GUIDES_CACHE_TAG, "max");
  return Response.json({ revalidated: true });
}

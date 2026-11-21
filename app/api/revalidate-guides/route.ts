import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { getEnv } from "@/lib/env";
import { GUIDES_CACHE_TAG } from "@/lib/guides/products";

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/revalidate-guides (header x-internal-secret = CRON_SECRET) – called after the weekly
 * `npm run guides:refresh` so the static guide pages pick up the new products at once.
 * Without the call they refresh on their own within a week.
 */
export async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-internal-secret"), getEnv().CRON_SECRET)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  revalidateTag(GUIDES_CACHE_TAG, "max");
  return Response.json({ revalidated: true });
}

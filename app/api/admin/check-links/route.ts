import { after } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE, isSameOriginRequest, isValidAdminSession } from "@/lib/admin/auth";
import { startCatalogCheck } from "@/lib/catalog-check/job";

/** POST /api/admin/check-links – "Sprawdź linki teraz" (admin only). No AI is involved. */
export async function POST(request: Request) {
  // proxy.ts checks the same; repeated here so the route is safe on its own.
  if (!isValidAdminSession((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOriginRequest(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { background, ...result } = await startCatalogCheck();
  if (background) after(background);
  return Response.json(result, { status: result.reason === "failed" ? 502 : 200 });
}

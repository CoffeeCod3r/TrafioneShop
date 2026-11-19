import { NextResponse } from "next/server";

import { isValidSessionId, PACK_COOKIE, packCodeForSession, packCookieOptions } from "@/lib/packs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/pack/claim?session_id=…&result=… – where Stripe (or the demo checkout) sends the buyer
 * of a pack. Stores the pack code in an httpOnly cookie, then shows the result. The cookie is
 * worthless until the webhook has confirmed the payment and created the pack.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const resultId = url.searchParams.get("result") ?? "";

  // Redirect only to our own result page, built from a validated UUID (no open redirect).
  const target = new URL(UUID.test(resultId) ? `/wynik/${resultId}?platnosc=ok` : "/quiz", url.origin);
  const response = NextResponse.redirect(target);
  if (isValidSessionId(sessionId)) {
    response.cookies.set(PACK_COOKIE, packCodeForSession(sessionId), packCookieOptions());
  }
  return response;
}

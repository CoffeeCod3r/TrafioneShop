import { NextResponse } from "next/server";

import { isValidPackCode, PACK_COOKIE, packCookieOptions } from "@/lib/packs";
import { getRepos } from "@/lib/services/db";

/**
 * GET /pakiet/<code> – the pack link shown after buying a pack. Opens the pack on another
 * device or browser: sets the cookie and sends the visitor to the quiz.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const origin = new URL(request.url).origin;

  const purchase = isValidPackCode(code) ? await getRepos().purchases.getByPackCode(code) : null;
  if (!purchase || purchase.status !== "paid" || purchase.offer === "single") {
    return NextResponse.redirect(new URL("/quiz", origin));
  }
  const response = NextResponse.redirect(new URL("/quiz?pakiet=ok", origin));
  response.cookies.set(PACK_COOKIE, code, packCookieOptions());
  return response;
}

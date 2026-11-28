import {
  ADMIN_SESSION_SECONDS,
  adminSessionCookie,
  checkAdminPassword,
  createAdminSession,
  isSameOriginRequest,
} from "@/lib/admin/auth";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";

/** POST /api/admin/login { password } – sets an httpOnly session cookie. Max 5 attempts per IP per 15 minutes. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const env = getEnv();
  const allowed = await consumeRateLimit("adminLogin", hashIp(getClientIp(request), env.IP_HASH_SALT));
  if (!allowed) return Response.json({ error: "Zbyt wiele prób. Spróbuj za 15 minut." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" && body.password.length <= 200 ? body.password : "";
  if (!password || !checkAdminPassword(password)) {
    logEvent("admin.login_failed");
    return Response.json({ error: "Nieprawidłowe hasło." }, { status: 401 });
  }

  return new Response(null, {
    status: 204,
    headers: { "set-cookie": adminSessionCookie(createAdminSession(), ADMIN_SESSION_SECONDS) },
  });
}

import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, checkAdminPassword, createAdminSession } from "@/lib/admin/auth";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";

/** POST /api/admin/login { password } – sets an httpOnly session cookie. */
export async function POST(request: Request) {
  const env = getEnv();
  const allowed = await consumeRateLimit("adminLogin", hashIp(getClientIp(request), env.IP_HASH_SALT));
  if (!allowed) return Response.json({ error: "Zbyt wiele prób. Spróbuj jutro." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || !checkAdminPassword(password)) {
    logEvent("admin.login_failed");
    return Response.json({ error: "Nieprawidłowe hasło." }, { status: 401 });
  }

  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": `${ADMIN_COOKIE}=${createAdminSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_SECONDS}${secure}`,
    },
  });
}

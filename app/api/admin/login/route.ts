import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, checkAdminPassword, createAdminSession } from "@/lib/admin/auth";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { dayWindowStart } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";

const DAILY_ATTEMPTS_PER_IP = 10;

/** POST /api/admin/login { password } – sets an httpOnly session cookie. */
export async function POST(request: Request) {
  const env = getEnv();
  const allowed = await getRepos().rateLimits.consume(
    `admin_login:${hashIp(getClientIp(request), env.IP_HASH_SALT)}`,
    dayWindowStart(),
    DAILY_ATTEMPTS_PER_IP,
  );
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

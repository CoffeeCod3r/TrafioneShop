import { ADMIN_COOKIE } from "@/lib/admin/auth";

/** POST /api/admin/logout – clears the session cookie. */
export async function POST() {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` },
  });
}

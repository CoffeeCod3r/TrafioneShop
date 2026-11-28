import { adminSessionCookie, isSameOriginRequest } from "@/lib/admin/auth";

/** POST /api/admin/logout – clears the session cookie. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return new Response(null, { status: 204, headers: { "set-cookie": adminSessionCookie("", 0) } });
}

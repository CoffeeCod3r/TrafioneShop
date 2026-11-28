import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, isSameOriginRequest, isValidAdminSession } from "@/lib/admin/auth";

/** Admin endpoints that must work without a session. */
const PUBLIC_ADMIN_API = new Set(["/api/admin/login", "/api/admin/logout"]);

/**
 * Central guard for everything under /admin and /api/admin (each route also checks on its own):
 * - /api/admin/*: a valid admin session (401) and, for anything but GET/HEAD, a same-origin Origin header (403, CSRF);
 * - /admin pages: noindex. The page itself shows the login form without a session.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/admin")) {
    const safeMethod = request.method === "GET" || request.method === "HEAD";
    if (!safeMethod && !isSameOriginRequest(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-robots-tag": "noindex, nofollow" } });
    }
    if (!PUBLIC_ADMIN_API.has(pathname) && !isValidAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "x-robots-tag": "noindex, nofollow" } });
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-robots-tag", "noindex, nofollow");
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};

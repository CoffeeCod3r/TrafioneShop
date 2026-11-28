import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison of a received secret with the expected one (hashing first hides the length too). */
export function isSameSecret(received: string | null | undefined, expected: string): boolean {
  if (!received || !expected) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `x-internal-secret: <CRON_SECRET>` (Edge Function, scripts). */
export function hasCronSecret(request: Request, secret: string): boolean {
  const bearer = request.headers.get("authorization");
  return (
    isSameSecret(bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length) : null, secret) ||
    isSameSecret(request.headers.get("x-internal-secret"), secret)
  );
}

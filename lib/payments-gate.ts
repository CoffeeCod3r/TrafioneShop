import { cookies } from "next/headers";

import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin/auth";
import { parseBool } from "@/lib/mode";

/** PAYMENTS_ENABLED (default false): are paid offers open to everybody? Server only. */
export function arePaymentsEnabled(): boolean {
  return parseBool(process.env.PAYMENTS_ENABLED, false);
}

/**
 * Whether the current visitor may buy. Everybody when PAYMENTS_ENABLED=true; otherwise only an
 * administrator logged in at /admin (so payments can be tested before launch).
 * Must be called in a request context (reads cookies).
 */
export async function canUsePayments(): Promise<boolean> {
  if (arePaymentsEnabled()) return true;
  return isValidAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
}

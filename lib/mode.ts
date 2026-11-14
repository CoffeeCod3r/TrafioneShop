/**
 * Demo mode switch. MOCK_MODE defaults to true: every external service (AI, payments,
 * database, captcha, email) uses its demo implementation.
 * Shared with Node scripts: keep this file dependency-free.
 */

export function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value for MOCK_MODE: "${value}"`);
}

export function isMockMode(): boolean {
  return parseBool(process.env.MOCK_MODE, true);
}

export const MOCK_MODE_IN_PRODUCTION_ERROR =
  "MOCK_MODE=true is not allowed in production (VERCEL_ENV=production). Set MOCK_MODE=false and configure all service keys.";

/** Throws when demo mode would run on the production deployment. */
export function assertModeAllowed(): void {
  if (process.env.VERCEL_ENV === "production" && isMockMode()) {
    throw new Error(MOCK_MODE_IN_PRODUCTION_ERROR);
  }
}

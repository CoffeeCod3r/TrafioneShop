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

/** Services that can run for real while MOCK_MODE=true (everything else stays demo). */
export type OverridableService = "db" | "payments";

/**
 * True when the real implementation of a service should be used.
 * MOCK_MODE=false: always real. MOCK_MODE=true: demo, unless REAL_DB=true / REAL_PAYMENTS=true.
 * MOCK_MODE=true is still refused in production, so an override can never reach production.
 */
export function isRealService(service: OverridableService): boolean {
  if (!isMockMode()) return true;
  return parseBool(process.env[`REAL_${service.toUpperCase()}`], false);
}

export const MOCK_MODE_IN_PRODUCTION_ERROR =
  "MOCK_MODE=true is not allowed in production (VERCEL_ENV=production or Netlify CONTEXT=production). Set MOCK_MODE=false and configure all service keys.";

/** Production deployment on Vercel or Netlify. Same rule is inlined in next.config.ts. */
export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || (process.env.NETLIFY === "true" && process.env.CONTEXT === "production");
}

/** Throws when demo mode would run on the production deployment. */
export function assertModeAllowed(): void {
  if (isProductionDeploy() && isMockMode()) {
    throw new Error(MOCK_MODE_IN_PRODUCTION_ERROR);
  }
}

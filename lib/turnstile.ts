import { logEvent, describeError } from "./log.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = { success: boolean; action?: string; "error-codes"?: string[] };

/** Verifies a Cloudflare Turnstile token server-side. Fails closed on network errors. */
export async function verifyTurnstile(options: {
  token: string | undefined;
  secret: string;
  ip?: string;
  expectedAction?: string;
}): Promise<boolean> {
  const { token, secret, ip, expectedAction } = options;
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const response = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      logEvent("turnstile.http_error", { status: response.status });
      return false;
    }
    const result = (await response.json()) as SiteverifyResponse;
    if (!result.success) {
      logEvent("turnstile.rejected", { codes: (result["error-codes"] ?? []).join(",") });
      return false;
    }
    if (expectedAction && result.action && result.action !== expectedAction) {
      logEvent("turnstile.wrong_action");
      return false;
    }
    return true;
  } catch (error) {
    logEvent("turnstile.error", describeError(error));
    return false;
  }
}

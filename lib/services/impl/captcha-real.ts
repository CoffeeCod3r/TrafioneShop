import { getServiceEnv } from "@/lib/env";
import type { CaptchaService } from "@/lib/services/captcha";
import { verifyTurnstile } from "@/lib/turnstile";

/** Cloudflare Turnstile, verified server-side. */
export function createRealCaptcha(): CaptchaService {
  return {
    verify: ({ token, ip, action }) =>
      verifyTurnstile({ token, ip, expectedAction: action, secret: getServiceEnv().TURNSTILE_SECRET_KEY }),
  };
}

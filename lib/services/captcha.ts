/**
 * Captcha service. Implementations: Cloudflare Turnstile (impl/captcha-real.ts) and demo
 * (impl/captcha-demo.ts, always passes). The rest of the code uses only getCaptcha().
 */
import { isMockMode } from "@/lib/mode";
import { createDemoCaptcha } from "@/lib/services/impl/captcha-demo";
import { createRealCaptcha } from "@/lib/services/impl/captcha-real";

export type CaptchaService = {
  verify(input: { token: string | undefined; ip?: string; action: string }): Promise<boolean>;
};

let service: CaptchaService | undefined;

export function getCaptcha(): CaptchaService {
  service ??= isMockMode() ? createDemoCaptcha() : createRealCaptcha();
  return service;
}

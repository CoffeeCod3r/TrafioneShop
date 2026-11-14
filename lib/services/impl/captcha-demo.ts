import type { CaptchaService } from "@/lib/services/captcha";

/** Demo captcha: always passes. */
export function createDemoCaptcha(): CaptchaService {
  return { verify: async () => true };
}

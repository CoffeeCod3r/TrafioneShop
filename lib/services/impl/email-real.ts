import { Resend } from "resend";

import { getServiceEnv } from "@/lib/env";
import type { EmailService } from "@/lib/services/email";

/** Resend. */
export function createRealEmail(): EmailService {
  let client: Resend | undefined;
  return {
    async send({ to, subject, text, html, headers }) {
      const env = getServiceEnv();
      client ??= new Resend(env.RESEND_API_KEY);
      const { error } = await client.emails.send({ from: env.EMAIL_FROM, to, subject, text, html, headers });
      if (error) throw new Error(`Email failed (${error.name})`);
    },
  };
}

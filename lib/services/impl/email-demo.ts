import { getEnv } from "@/lib/env";
import type { EmailService } from "@/lib/services/email";

/** Demo email: prints the message to the server console instead of sending it. */
export function createDemoEmail(): EmailService {
  return {
    async send({ to, subject, text }) {
      console.log(
        [
          "",
          "──── [DEMO EMAIL] ────",
          `From: ${getEnv().EMAIL_FROM}`,
          `To: ${to}`,
          `Subject: ${subject}`,
          "",
          text,
          "──────────────────────",
          "",
        ].join("\n"),
      );
    },
  };
}

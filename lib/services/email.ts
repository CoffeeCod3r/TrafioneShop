/**
 * Email service. Implementations: Resend (impl/email-real.ts) and demo
 * (impl/email-demo.ts, prints to the console). The rest of the code uses only getEmail().
 */
import { isMockMode } from "@/lib/mode";
import { createDemoEmail } from "@/lib/services/impl/email-demo";
import { createRealEmail } from "@/lib/services/impl/email-real";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export type EmailService = {
  send(message: EmailMessage): Promise<void>;
};

let service: EmailService | undefined;

export function getEmail(): EmailService {
  service ??= isMockMode() ? createDemoEmail() : createRealEmail();
  return service;
}

import { getEnv } from "@/lib/env";
import type { EmailMessage } from "@/lib/services/email";

import { SUBSCRIBE_OCCASIONS, type SubscribeOccasion } from "./schema";
import { CONFIRM_TOKEN_TTL_DAYS, createConfirmToken, createUnsubscribeToken } from "./tokens";

function siteUrl(path: string): string {
  return new URL(path, getEnv().NEXT_PUBLIC_SITE_URL).toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Every marketing email gets an unsubscribe link in the footer plus RFC 8058 one-click headers,
 * so Gmail/Outlook can show their own "Wypisz się" button.
 */
export function withUnsubscribe(email: string, message: Omit<EmailMessage, "to" | "headers">): EmailMessage {
  const token = createUnsubscribeToken(email);
  const pageUrl = siteUrl(`/wypisz?token=${token}`);
  const oneClickUrl = siteUrl(`/api/unsubscribe?token=${token}`);
  const footerText = `\n\n—\nNie chcesz więcej wiadomości? Wypisz się: ${pageUrl}`;
  const footerHtml = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"><p style="font-size:12px;color:#6b7280">Nie chcesz więcej wiadomości? <a href="${escapeHtml(pageUrl)}">Wypisz się</a>.</p>`;

  return {
    to: email,
    subject: message.subject,
    text: message.text + footerText,
    html: message.html ? message.html + footerHtml : undefined,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export function confirmationEmail(email: string, occasions: SubscribeOccasion[]): EmailMessage {
  const confirmUrl = siteUrl(`/zapis/potwierdz?token=${createConfirmToken(email, occasions)}`);
  const labels = SUBSCRIBE_OCCASIONS.filter((occasion) => occasions.includes(occasion.value))
    .map((occasion) => occasion.label)
    .join(", ");

  return withUnsubscribe(email, {
    subject: "Potwierdź zapis do przypomnień o prezentach",
    text: [
      "Cześć!",
      "",
      `Ktoś (mamy nadzieję, że Ty) zapisał ten adres do przypomnień Prezentownika AI o okazjach: ${labels}.`,
      "",
      `Aby potwierdzić zapis, otwórz link (ważny ${CONFIRM_TOKEN_TTL_DAYS} dni):`,
      confirmUrl,
      "",
      "Jeśli to nie Ty, po prostu zignoruj tę wiadomość. Bez potwierdzenia nie wyślemy nic więcej.",
    ].join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:520px">
<p>Cześć!</p>
<p>Ktoś (mamy nadzieję, że Ty) zapisał ten adres do przypomnień Prezentownika AI o okazjach: <strong>${escapeHtml(labels)}</strong>.</p>
<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#1f2937;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Potwierdzam zapis</a></p>
<p style="font-size:14px;color:#6b7280">Link jest ważny ${CONFIRM_TOKEN_TTL_DAYS} dni. Jeśli to nie Ty, zignoruj tę wiadomość. Bez potwierdzenia nie wyślemy nic więcej.</p>
</div>`,
  });
}

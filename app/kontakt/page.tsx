import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";
import { InfoPage } from "@/components/info/info-page";
import { isMockMode } from "@/lib/mode";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

const DESCRIPTION = `Kontakt z Prezentoskopem: napisz na ${CONTACT_EMAIL} albo użyj formularza. Odpowiadamy na pytania o serwis, płatności i dane.`;

export const metadata: Metadata = {
  title: `Kontakt – ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: "/kontakt" },
  openGraph: { type: "website", title: `Kontakt – ${SITE_NAME}`, description: DESCRIPTION, url: "/kontakt", siteName: SITE_NAME, locale: "pl_PL" },
};

export default function ContactPage() {
  return (
    <InfoPage title="Kontakt" lead="Masz pytanie, uwagę albo problem z wynikiem lub płatnością? Napisz do nas.">
      <section className="flex flex-col gap-3">
        <h2>E-mail</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>
          Przy problemie z wynikiem lub płatnością podaj adres wyniku (link). Dzięki temu szybciej sprawdzimy sprawę.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Formularz</h2>
        <ContactForm demo={isMockMode()} />
      </section>
    </InfoPage>
  );
}

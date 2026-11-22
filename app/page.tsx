import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, ListChecks, ShieldCheck, Sparkles, Store } from "lucide-react";

import { StartQuizLink } from "@/components/analytics/start-quiz-link";
import { GuideCards } from "@/components/guides/guide-links";
import { GiftStack } from "@/components/illustrations/gift-stack";
import { HeroTag } from "@/components/illustrations/hero-tag";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const HOME_GUIDES = ["prezent-dla-taty-do-100-zl", "prezent-dla-mamy-do-100-zl", "prezenty-do-50-zl"];

const TRUST = [
  { icon: Store, title: "Nie jesteśmy sklepem", text: "Niczego nie sprzedajemy. Kupujesz w sklepie, do którego prowadzi link." },
  { icon: ShieldCheck, title: "Linki partnerskie są oznaczone", text: "Po Twoim zakupie sklep może nam zapłacić prowizję. Cena dla Ciebie jest taka sama, a prowizja nie wpływa na wybór ani kolejność propozycji." },
  { icon: Camera, title: "Zdjęcie nigdzie nie zostaje", text: "Służy tylko do opisania stylu i nie jest zapisywane." },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, inLanguage: "pl-PL" },
    { "@type": "Organization", name: SITE_NAME, url: SITE_URL, email: CONTACT_EMAIL },
  ],
};

const STEPS = [
  { icon: ListChecks, title: "Odpowiadasz na kilka pytań", text: "Dla kogo, budżet, okazja, czym się interesuje i jak ją opisać." },
  { icon: Camera, title: "Dodajesz zdjęcie, jeśli chcesz", text: "AI patrzy tylko na styl, ubrania i przedmioty." },
  { icon: Sparkles, title: "Dostajesz 5 prezentów", text: "Z polskich sklepów, z ceną i krótkim „dlaczego”." },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 pb-16 pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <section className="flex flex-col gap-7">
        <HeroTag>
          <h1 className="text-[2rem] font-extrabold leading-[1.05] sm:text-5xl">
            Odpowiedz na kilka pytań i dostań 5 trafionych prezentów
          </h1>
        </HeroTag>
        <p className="max-w-prose text-lg">
          Zajmie Ci to około minuty. Zdjęcie jest opcjonalne i nigdzie go nie zapisujemy.
        </p>
        <StartQuizLink />
      </section>

      <GiftStack className="mx-auto w-full max-w-sm" />

      <section aria-labelledby="how-it-works" className="flex flex-col gap-5">
        <h2 id="how-it-works" className="text-2xl font-bold">
          Jak to działa
        </h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex items-start gap-4">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-mint font-display text-lg font-bold"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="flex items-center gap-2 font-semibold">
                  <Icon className="size-4 text-ribbon" aria-hidden />
                  {title}
                </p>
                <p className="text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="guides" className="flex flex-col gap-4">
        <h2 id="guides" className="text-2xl font-bold">
          Poradniki prezentowe
        </h2>
        <p className="text-muted-foreground">Nie wiesz, od czego zacząć? Zajrzyj do poradników: jak wybrać prezent dla konkretnej osoby i budżetu.</p>
        <GuideCards slugs={HOME_GUIDES} />
        <Link href="/poradniki" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
          Wszystkie poradniki
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <section aria-labelledby="trust" className="flex flex-col gap-4">
        <h2 id="trust" className="text-2xl font-bold">
          Uczciwie o tym, jak działamy
        </h2>
        <ul className="flex flex-col gap-4">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="mt-1 size-5 shrink-0 text-ribbon" aria-hidden />
              <p>
                <span className="font-semibold">{title}.</span> <span className="text-muted-foreground">{text}</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/jak-zarabiamy" className="underline underline-offset-4">Jak zarabiamy</Link>
          {" · "}
          <Link href="/o-nas" className="underline underline-offset-4">O nas</Link>
          {" · "}
          <Link href="/kontakt" className="underline underline-offset-4">Kontakt</Link>
        </p>
      </section>
    </div>
  );
}

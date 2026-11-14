import { Camera, ListChecks, Sparkles } from "lucide-react";

import { StartQuizLink } from "@/components/analytics/start-quiz-link";
import { GiftStack } from "@/components/illustrations/gift-stack";
import { HeroTag } from "@/components/illustrations/hero-tag";

const STEPS = [
  { icon: ListChecks, title: "Odpowiadasz na 6 pytań", text: "Dla kogo, budżet, okazja i czym się interesuje." },
  { icon: Camera, title: "Dodajesz zdjęcie, jeśli chcesz", text: "AI patrzy tylko na styl, ubrania i przedmioty." },
  { icon: Sparkles, title: "Dostajesz 5 prezentów", text: "Z polskich sklepów, z ceną i krótkim „dlaczego”." },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 pb-16 pt-4">
      <section className="flex flex-col gap-7">
        <HeroTag>
          <h1 className="text-[2rem] font-extrabold leading-[1.05] sm:text-5xl">
            Wrzuć zdjęcie, odpowiedz na 6 pytań i dostań 5 trafionych prezentów
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
    </div>
  );
}

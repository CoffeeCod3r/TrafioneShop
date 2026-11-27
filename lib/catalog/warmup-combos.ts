/**
 * Quiz combinations to "warm up": for these the pool must give 5 good, checked products at once and without AI
 * (npm run catalog:warmup). EDIT FREELY: add or remove lines. Values are quiz codes (lib/quiz/schema.ts):
 *   recipient: dad | mom | girlfriend | boyfriend | friend | boss | grandparent
 *   budget:    50 | 100 | 200 | 500 (zł, the quiz budget = the upper limit)
 *   interest:  one tag from lib/tags.ts (the quiz's interests), e.g. "kawa", "gotowanie", "gry"
 * The quiz has no child / teenager option (children's products are left out on purpose), and a colleague is covered
 * by "friend" and "boss".
 *
 * With at least 200 results from the last 30 days, `catalog:warmup` uses the 40 most frequent combinations of
 * real quizzes instead of this list.
 */
import type { AllowedTag } from "../tags.ts";

export type WarmupCombo = {
  recipient: "dad" | "mom" | "girlfriend" | "boyfriend" | "friend" | "boss" | "grandparent";
  budget: 50 | 100 | 200 | 500;
  interest: AllowedTag;
};

export const MAX_COMBOS = 40;

export const STARTER_COMBOS: WarmupCombo[] = [
  // Mama
  { recipient: "mom", budget: 100, interest: "kawa" },
  { recipient: "mom", budget: 100, interest: "gotowanie" },
  { recipient: "mom", budget: 100, interest: "ogród" },
  { recipient: "mom", budget: 100, interest: "uroda" },
  { recipient: "mom", budget: 50, interest: "książki" },
  { recipient: "mom", budget: 200, interest: "relaks" },
  { recipient: "mom", budget: 50, interest: "rośliny" },
  // Tata
  { recipient: "dad", budget: 100, interest: "kawa" },
  { recipient: "dad", budget: 100, interest: "majsterkowanie" },
  { recipient: "dad", budget: 200, interest: "sport" },
  { recipient: "dad", budget: 100, interest: "gadżety" },
  { recipient: "dad", budget: 200, interest: "gotowanie" },
  { recipient: "dad", budget: 50, interest: "książki" },
  { recipient: "dad", budget: 100, interest: "wędkarstwo" },
  // Dziadek / babcia
  { recipient: "grandparent", budget: 100, interest: "ogród" },
  { recipient: "grandparent", budget: 50, interest: "książki" },
  { recipient: "grandparent", budget: 50, interest: "herbata" },
  { recipient: "grandparent", budget: 100, interest: "relaks" },
  { recipient: "grandparent", budget: 50, interest: "puzzle" },
  // Dziewczyna
  { recipient: "girlfriend", budget: 100, interest: "uroda" },
  { recipient: "girlfriend", budget: 200, interest: "biżuteria" },
  { recipient: "girlfriend", budget: 50, interest: "książki" },
  { recipient: "girlfriend", budget: 50, interest: "świece" },
  { recipient: "girlfriend", budget: 100, interest: "kawa" },
  { recipient: "girlfriend", budget: 100, interest: "joga" },
  // Chłopak
  { recipient: "boyfriend", budget: 100, interest: "gry" },
  { recipient: "boyfriend", budget: 100, interest: "gadżety" },
  { recipient: "boyfriend", budget: 200, interest: "sport" },
  { recipient: "boyfriend", budget: 100, interest: "kawa" },
  { recipient: "boyfriend", budget: 200, interest: "technologia" },
  { recipient: "boyfriend", budget: 100, interest: "planszówki" },
  // Przyjaciel / przyjaciółka (także koleżanka / kolega z pracy)
  { recipient: "friend", budget: 100, interest: "planszówki" },
  { recipient: "friend", budget: 50, interest: "kawa" },
  { recipient: "friend", budget: 50, interest: "książki" },
  { recipient: "friend", budget: 50, interest: "koty" },
  { recipient: "friend", budget: 50, interest: "psy" },
  { recipient: "friend", budget: 50, interest: "słodycze" },
  { recipient: "friend", budget: 100, interest: "gry" },
  // Szef / szefowa
  { recipient: "boss", budget: 100, interest: "kawa" },
  { recipient: "boss", budget: 100, interest: "książki" },
];

export const comboKey = (combo: Pick<WarmupCombo, "recipient" | "budget" | "interest">) => `${combo.recipient}|${combo.budget}|${combo.interest}`;

const RECIPIENT_LABEL: Record<WarmupCombo["recipient"], string> = {
  dad: "tata",
  mom: "mama",
  girlfriend: "dziewczyna",
  boyfriend: "chłopak",
  friend: "przyjaciel/ka",
  boss: "szef/owa",
  grandparent: "dziadek/babcia",
};

export const comboLabel = (combo: WarmupCombo) => `${RECIPIENT_LABEL[combo.recipient]} · do ${combo.budget} zł · ${combo.interest}`;

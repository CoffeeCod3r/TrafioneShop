import type { Metadata } from "next";

import { QuizWizard } from "@/components/quiz/quiz-wizard";
import { isMockMode } from "@/lib/mode";

export const metadata: Metadata = { title: "Znajdź prezent – Prezentownik AI" };

export default function QuizPage() {
  return <QuizWizard demo={isMockMode()} />;
}

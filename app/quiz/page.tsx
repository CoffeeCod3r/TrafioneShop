import type { Metadata } from "next";

import { QuizWizard } from "@/components/quiz/quiz-wizard";

export const metadata: Metadata = { title: "Znajdź prezent – Prezentownik AI" };

export default function QuizPage() {
  return <QuizWizard />;
}

import type { Metadata } from "next";

import { QuizWizard } from "@/components/quiz/quiz-wizard";
import { isMockMode } from "@/lib/mode";

export const metadata: Metadata = {
  title: "Znajdź prezent – Prezentoskop",
  description: "Quiz o osobie, której kupujesz prezent: kilka pytań, opcjonalny opis lub zdjęcie i 5 propozycji z polskich sklepów.",
  alternates: { canonical: "/quiz" },
};

export default function QuizPage() {
  return <QuizWizard demo={isMockMode()} />;
}

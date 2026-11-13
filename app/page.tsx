import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="flex flex-1 flex-col justify-center gap-8 py-12">
      <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        Wrzuć zdjęcie, odpowiedz na 6 pytań i dostań 5 trafionych prezentów
      </h1>
      <p className="text-lg text-muted-foreground">
        Zajmie Ci to około minuty. Zdjęcie jest opcjonalne i nigdzie go nie zapisujemy.
      </p>
      <Button asChild size="xl" className="w-full sm:w-auto">
        <Link href="/quiz">
          Znajdź prezent
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </section>
  );
}

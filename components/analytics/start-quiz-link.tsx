"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sourceFromParams, sourceQuery } from "@/lib/attribution";

/** "Znajdź prezent" that keeps ?utm_source= / ?ref= so the result is attributed to its source. */
export function StartQuizLink() {
  const [href, setHref] = useState("/quiz");

  useEffect(() => {
    const source = sourceFromParams(new URLSearchParams(window.location.search));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only known in the browser
    if (source) setHref(`/quiz${sourceQuery(source)}`);
  }, []);

  return (
    <Button
      asChild
      size="xl"
      className="w-full shadow-[4px_4px_0_var(--ribbon)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ribbon)] sm:w-auto"
    >
      <Link href={href}>
        Znajdź prezent
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

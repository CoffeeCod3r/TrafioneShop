"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type OptionTileProps = {
  label: string;
  emoji: string;
  selected: boolean;
  onSelect: () => void;
};

export function OptionTile({ label, emoji, selected, onSelect }: OptionTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-20 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-medium transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]",
        selected
          ? "animate-pop border-ribbon bg-secondary shadow-[3px_3px_0_var(--ribbon)]"
          : "border-border bg-card hover:border-ink/40",
      )}
    >
      <span className="text-3xl leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="flex-1">{label}</span>
      {selected && <Check className="size-5 text-ribbon" aria-hidden />}
    </button>
  );
}

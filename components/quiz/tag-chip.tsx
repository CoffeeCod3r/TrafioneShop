"use client";

import { cn } from "@/lib/utils";

type TagChipProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function TagChip({ label, selected, disabled, onToggle }: TagChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "min-h-11 rounded-full border-2 px-4 text-sm font-medium transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40",
        selected
          ? "animate-pop border-ink bg-ink text-white"
          : "border-border bg-card hover:border-ink/40",
      )}
    >
      {label}
    </button>
  );
}

import {
  BookOpen,
  Coffee,
  Dumbbell,
  Flower2,
  Gamepad2,
  Gift,
  House,
  Laptop,
  type LucideIcon,
  Palette,
  PawPrint,
  Plane,
  Shirt,
  Sparkles,
  Tent,
  Utensils,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dom: House,
  ogrod: Flower2,
  kuchnia: Utensils,
  jedzenie: Coffee,
  zywnosc: Coffee,
  ksiazki: BookOpen,
  gry: Gamepad2,
  zabawki: Gamepad2,
  elektronika: Laptop,
  sport: Dumbbell,
  moda: Shirt,
  uroda: Sparkles,
  hobby: Palette,
  podroze: Plane,
  turystyka: Tent,
  zwierzeta: PawPrint,
};

/** Normalizes "Kuchnia > Akcesoria" / "podroze" / "Podróże" to the first segment without diacritics. */
function key(category: string | null): string {
  return (category ?? "")
    .split(">")[0]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/**
 * Icon of a gift category. Web products have no photo (shop photos are never stored),
 * so the card shows this icon instead.
 */
export function CategoryIcon({ category, className }: { category: string | null; className?: string }) {
  const Icon = ICONS[key(category)] ?? Gift;
  return <Icon className={cn("size-10 text-ink/70", className)} aria-hidden />;
}

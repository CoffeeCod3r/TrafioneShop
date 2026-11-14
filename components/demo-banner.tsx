import { isMockMode } from "@/lib/mode";

/** Yellow bar on every page while MOCK_MODE=true. */
export function DemoBanner() {
  if (!isMockMode()) return null;
  return (
    <div role="status" className="bg-yellow-300 px-4 py-1.5 text-center text-sm font-bold text-black">
      TRYB DEMO · AI, płatności i baza danych są udawane
    </div>
  );
}

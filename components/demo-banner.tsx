import { isMockMode, isRealService } from "@/lib/mode";

/** Yellow bar on every page while MOCK_MODE=true. Lists only the services that are really demo. */
export function DemoBanner() {
  if (!isMockMode()) return null;
  const fake = ["AI", ...(isRealService("payments") ? [] : ["płatności"]), ...(isRealService("db") ? [] : ["baza danych"])];
  const real = [...(isRealService("payments") ? ["Stripe (test)"] : []), ...(isRealService("db") ? ["Supabase"] : [])];
  return (
    <div role="status" className="bg-yellow-300 px-4 py-1.5 text-center text-sm font-bold text-black">
      TRYB DEMO · udawane: {fake.join(", ")}
      {real.length > 0 ? ` · prawdziwe: ${real.join(", ")}` : ""}
    </div>
  );
}

import { after } from "next/server";
import { z } from "zod";

import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { getPackFromCookies } from "@/lib/packs";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";
import { runWebSearch } from "@/lib/web-search";

// The search runs in the background via `after` (waitUntil), like after a Stripe payment.
export const maxDuration = 300;

const bodySchema = z.object({ resultId: z.uuid() });

/** POST /api/pack/redeem – uses one search from the visitor's pack of 8 on this result. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nieprawidłowe zapytanie." }, { status: 400 });
  const { resultId } = parsed.data;

  let claimed = false;
  let consumed = false;
  let purchaseId = "";
  try {
    const allowed = await consumeRateLimit("redeem", hashIp(getClientIp(request), getEnv().IP_HASH_SALT));
    if (!allowed) return Response.json({ error: "Zbyt wiele prób. Spróbuj jutro." }, { status: 429 });

    const pack = await getPackFromCookies();
    if (!pack) {
      return Response.json({ error: "Nie znaleźliśmy Twojego pakietu w tej przeglądarce. Otwórz link do pakietu." }, { status: 403 });
    }
    if (pack.searchesLeft <= 0) {
      return Response.json({ error: "Wykorzystałeś już wszystkie wyszukiwania z pakietu." }, { status: 409 });
    }

    const repos = getRepos();
    const result = await repos.results.getById(resultId);
    if (!result) return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });

    // 1. "none" → "pending" is atomic: one result can be searched only once.
    if (!(await repos.results.claimPayment(resultId))) {
      return Response.json({ error: "To wyszukiwanie zostało już uruchomione." }, { status: 409 });
    }
    claimed = true;
    // 2. Use one search of the pack (atomic). If it is gone, release the result again.
    purchaseId = pack.purchaseId;
    consumed = await repos.purchases.consumeSearch(purchaseId);
    if (!consumed) {
      await repos.results.update(resultId, { paid_status: "none" });
      return Response.json({ error: "Wykorzystałeś już wszystkie wyszukiwania z pakietu." }, { status: 409 });
    }

    const purchase = await repos.purchases.getByPackCode(pack.code);
    if (!purchase) throw new Error("Pack purchase vanished");
    logEvent("pack.redeemed", { left: Math.max(pack.searchesLeft - 1, 0) });
    // Same search as after a payment. `result_id` points at the result being searched now.
    after(() => runWebSearch({ ...purchase, result_id: resultId }));
    return Response.json({ ok: true, searchesLeft: Math.max(pack.searchesLeft - 1, 0) });
  } catch (error) {
    logEvent("pack.redeem_failed", describeError(error));
    // Do not leave the result stuck or the search lost if something broke after they were taken.
    try {
      if (consumed) await getRepos().purchases.restoreSearch(purchaseId);
      if (claimed) await getRepos().results.update(resultId, { paid_status: "none" });
    } catch {
      // Logged by the repositories; nothing more to do here.
    }
    return Response.json({ error: "Nie udało się uruchomić wyszukiwania. Spróbuj ponownie." }, { status: 500 });
  }
}

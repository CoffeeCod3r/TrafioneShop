"use client";

import { useEffect } from "react";

import { track, trackOnce } from "@/lib/analytics/client";
import type { PaidStatus, PriceVariant } from "@/lib/db";

type ResultTrackerProps = {
  resultId: string;
  shared: boolean;
  paidStatus: PaidStatus;
  priceVariant: PriceVariant | null;
  justPaid: boolean;
};

/** result_viewed on every view; web_search_paid / web_search_refunded once per result and tab. */
export function ResultTracker({ resultId, shared, paidStatus, priceVariant, justPaid }: ResultTrackerProps) {
  useEffect(() => {
    track("result_viewed", { shared, paid_status: paidStatus });
    // Only once per page load: refreshes while polling must not repeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId]);

  useEffect(() => {
    if (justPaid && paidStatus !== "none") {
      trackOnce(`paid:${resultId}`, "web_search_paid", { price_variant: priceVariant });
    }
    if (paidStatus === "refunded") {
      trackOnce(`refunded:${resultId}`, "web_search_refunded", { price_variant: priceVariant });
    }
  }, [resultId, justPaid, paidStatus, priceVariant]);

  return null;
}

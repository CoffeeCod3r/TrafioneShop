import { z } from "zod";

/** Raw pick as returned by the AI (save_web_picks), before server-side verification. */
export const rawWebPickSchema = z.object({
  name: z.string().trim().min(2).max(300),
  price_pln: z.number().positive().max(100_000),
  shop: z.string().trim().max(200),
  url: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(3).max(300),
});
export type RawWebPick = z.infer<typeof rawWebPickSchema>;

/** A page the AI actually opened with web_fetch in this run (evidence for verification). */
export type FetchedPage = { url: string; retrievedAt: string | null };

/** A verified product from the paid web search, as stored in results.web_picks. */
export const webPickSchema = z.object({
  title: z.string().trim().min(2).max(300),
  /** Product page that was fetched and checked. */
  url: z.string().min(1).max(2000),
  /** Where "Zobacz w sklepie" leads (affiliate deeplink when the shop has one), via /go/w/... */
  outboundUrl: z.string().min(1).max(4000),
  shopDomain: z.string().min(3).max(200),
  shopName: z.string().max(200).nullable(),
  pricePln: z.number().positive().max(100_000),
  imageUrl: z.string().max(2000).nullable(),
  reason: z.string().trim().min(3).max(200),
  /** ISO time when price and availability were checked. */
  checkedAt: z.string(),
});
export type WebPick = z.infer<typeof webPickSchema>;

export const dedicationsSchema = z.array(z.string().trim().min(5).max(300)).length(3);
export type Dedications = z.infer<typeof dedicationsSchema>;

export const MIN_VERIFIED_WEB_PICKS = 5;
export const MAX_WEB_PICKS = 10;

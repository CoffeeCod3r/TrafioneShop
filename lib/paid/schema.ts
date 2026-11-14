import { z } from "zod";

/** A product found by the paid web search, verified on the shop's page. */
export const webPickSchema = z.object({
  title: z.string().trim().min(2).max(300),
  /** Absolute https URL on an allowed shop domain (demo: relative /demo-produkt/... link). */
  url: z.string().min(1).max(2000),
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

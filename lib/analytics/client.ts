"use client";

import type { PostHog } from "posthog-js";

/**
 * PostHog events. `track` does nothing until the visitor accepts analytics cookies
 * (components/consent/analytics.tsx sets the instance only after consent).
 * Never pass personal data, quiz free text or anything from the photo.
 */
export type AnalyticsEvent =
  | "quiz_started"
  | `quiz_step_${number}`
  | "quiz_completed"
  | "photo_added"
  | "result_viewed"
  | "product_clicked"
  | "share_clicked"
  | "web_search_viewed"
  | "offer_selected"
  | "pack_redeemed"
  | "web_search_paid"
  | "web_search_refunded"
  | "subscribed";

type Properties = Record<string, string | number | boolean | null>;

let instance: PostHog | null = null;

export function setAnalyticsInstance(client: PostHog | null): void {
  instance = client;
}

export function track(event: AnalyticsEvent, properties: Properties = {}): void {
  try {
    instance?.capture(event, properties);
  } catch {
    // Analytics must never break the page.
  }
}

/** Fires an event at most once per browser tab session (e.g. "paid" after returning from Stripe). */
export function trackOnce(key: string, event: AnalyticsEvent, properties: Properties = {}): void {
  try {
    if (window.sessionStorage.getItem(key)) return;
    if (!instance) return; // no consent yet: do not mark as sent
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage unavailable: send anyway
  }
  track(event, properties);
}

"use client";

import { useEffect } from "react";

import { CONSENT_EVENT, readConsent, type AnalyticsConsent } from "@/lib/consent/storage";

type AnalyticsProps = { posthogKey: string | null; posthogHost: string };

type PostHogClient = typeof import("posthog-js").default;
let client: PostHogClient | null = null;

/** Removes query strings and hashes (tokens, ?ref=, ?platnosc=) from tracked URLs. */
function stripUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

async function start(key: string, host: string) {
  if (client) {
    client.opt_in_capturing();
    return;
  }
  // Loaded only after consent: before that, no PostHog code runs and nothing is stored.
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: host,
    persistence: "localStorage+cookie",
    capture_pageview: "history_change",
    // Privacy: no autocapture of clicks/inputs, no session recordings (could show the photo), no surveys.
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    person_profiles: "identified_only",
    before_send: (event) => {
      if (!event) return event;
      for (const property of ["$current_url", "$referrer", "$initial_referrer"]) {
        if (property in event.properties) event.properties[property] = stripUrl(event.properties[property]);
      }
      return event;
    },
  });
  client = posthog;
}

function stop() {
  if (!client) return;
  client.opt_out_capturing();
  client.reset();
}

/** Starts PostHog only when the visitor accepted analytics cookies; stops it on withdrawal. */
export function Analytics({ posthogKey, posthogHost }: AnalyticsProps) {
  useEffect(() => {
    if (!posthogKey) return;
    if (readConsent() === "granted") void start(posthogKey, posthogHost);

    function onChange(event: Event) {
      const consent = (event as CustomEvent<AnalyticsConsent>).detail;
      if (consent === "granted") void start(posthogKey!, posthogHost);
      else stop();
    }
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, [posthogKey, posthogHost]);

  return null;
}

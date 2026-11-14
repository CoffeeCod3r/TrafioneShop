/** Analytics consent, stored only in the browser (localStorage). */
export type AnalyticsConsent = "granted" | "denied";

const KEY = "prezentownik:analytics-consent";
export const CONSENT_EVENT = "prezentownik:consent-change";
export const OPEN_SETTINGS_EVENT = "prezentownik:open-cookie-settings";

export function readConsent(): AnalyticsConsent | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the choice applies to this page view only.
  }
  window.dispatchEvent(new CustomEvent<AnalyticsConsent>(CONSENT_EVENT, { detail: value }));
}


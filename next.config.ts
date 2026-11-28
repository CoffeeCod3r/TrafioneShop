import type { NextConfig } from "next";

// Fail the build/start when demo mode would reach production.
// (Same rule as lib/mode.ts, inlined so the config has no app imports.)
const mockMode = !["false", "0", "no", "off"].includes((process.env.MOCK_MODE ?? "true").trim().toLowerCase());
const productionDeploy =
  process.env.VERCEL_ENV === "production" || process.env.CONTEXT === "production";
if (productionDeploy && mockMode) {
  throw new Error(
    "MOCK_MODE=true is not allowed in production (VERCEL_ENV=production or Netlify CONTEXT=production). Set MOCK_MODE=false and configure all service keys.",
  );
}

const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * Content Security Policy. Sent as Content-Security-Policy-Report-Only while we confirm in a deploy preview that
 * nothing legitimate is blocked; set CSP_ENFORCE=true to send the enforcing header instead.
 * Next.js App Router renders inline bootstrap scripts, so enforcing without 'unsafe-inline' in script-src needs
 * per-request nonces (see SECURITY_AUDIT.md). No 'unsafe-eval' outside `next dev` (React Refresh needs it).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://eu-assets.i.posthog.com${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com https://challenges.cloudflare.com https://api.stripe.com ${supabaseOrigin}${isDev ? " ws:" : ""}`.trim(),
  "frame-src https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const enforceCsp = ["true", "1"].includes((process.env.CSP_ENFORCE ?? "").trim().toLowerCase());

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com")',
  },
  { key: enforceCsp ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
];

const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin", headers: noIndex },
      { source: "/admin/:path*", headers: noIndex },
      { source: "/api/admin/:path*", headers: noIndex },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

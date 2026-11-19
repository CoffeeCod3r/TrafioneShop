import type { NextConfig } from "next";

// Fail the build/start when demo mode would reach production.
// (Same rule as lib/mode.ts, inlined so the config has no app imports.)
const mockMode = !["false", "0", "no", "off"].includes((process.env.MOCK_MODE ?? "true").trim().toLowerCase());
const productionDeploy =
  process.env.VERCEL_ENV === "production" || (process.env.NETLIFY === "true" && process.env.CONTEXT === "production");
if (productionDeploy && mockMode) {
  throw new Error(
    "MOCK_MODE=true is not allowed in production (VERCEL_ENV=production or Netlify CONTEXT=production). Set MOCK_MODE=false and configure all service keys.",
  );
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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

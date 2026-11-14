import type { NextConfig } from "next";

// Fail the build/start when demo mode would reach production.
// (Same rule as lib/mode.ts, inlined so the config has no app imports.)
const mockMode = !["false", "0", "no", "off"].includes((process.env.MOCK_MODE ?? "true").trim().toLowerCase());
if (process.env.VERCEL_ENV === "production" && mockMode) {
  throw new Error(
    "MOCK_MODE=true is not allowed in production (VERCEL_ENV=production). Set MOCK_MODE=false and configure all service keys.",
  );
}

const nextConfig: NextConfig = {
  /* config options here */
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

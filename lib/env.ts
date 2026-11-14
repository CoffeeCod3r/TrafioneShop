import { z } from "zod";

import { parseFeedSources } from "./feeds/config.ts";
import { assertModeAllowed, isMockMode } from "./mode.ts";

/**
 * Server-side environment validation.
 * - MOCK_MODE=true (default): service keys are optional, demo implementations are used.
 * - MOCK_MODE=false: every service key is required.
 * Validation is lazy so `next build` and lint do not fail when env vars are absent;
 * instrumentation.ts calls getEnv() on server start to fail fast.
 */

const feedSources = z.string().transform((value, ctx) => {
  try {
    return parseFeedSources(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid FEED_URLS" });
    return z.NEVER;
  }
});

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(1024),
  PAID_SEARCH_MAX_SEARCHES: z.coerce.number().int().positive().max(20).default(5),
  PAID_SEARCH_MAX_FETCHES: z.coerce.number().int().positive().max(30).default(15),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://eu.i.posthog.com"),
});

const serviceSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),

  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "Expected a Stripe secret key"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_ID_A: z.string().startsWith("price_"),
  STRIPE_PRICE_ID_B: z.string().startsWith("price_"),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),

  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),

  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),

  CRON_SECRET: z.string().min(32),
  IP_HASH_SALT: z.string().min(32),
  EMAIL_TOKEN_SECRET: z.string().min(32),
  ADMIN_PASSWORD: z.string().min(12),
  FEED_URLS: feedSources,
});

/** Demo defaults for secrets the app itself needs even without external services. */
const DEMO_DEFAULTS = {
  CRON_SECRET: "demo-cron-secret-demo-cron-secret",
  IP_HASH_SALT: "demo-ip-hash-salt-demo-ip-hash-salt",
  EMAIL_TOKEN_SECRET: "demo-email-token-secret-demo-email-token",
  ADMIN_PASSWORD: "demo-admin-pass",
  EMAIL_FROM: "Prezentownik AI (demo) <demo@example.pl>",
};

export type ServiceEnv = z.infer<typeof serviceSchema>;
type BaseEnv = z.infer<typeof baseSchema>;

export type ServerEnv = BaseEnv &
  Partial<ServiceEnv> &
  Pick<ServiceEnv, "CRON_SECRET" | "IP_HASH_SALT" | "EMAIL_TOKEN_SECRET" | "ADMIN_PASSWORD" | "EMAIL_FROM"> & {
    mockMode: boolean;
  };

let cached: ServerEnv | undefined;

function formatIssues(error: z.ZodError): string {
  // Variable names only, never values.
  return error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
}

export function getEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("lib/env.ts must not be imported in client code");
  }
  if (cached) return cached;

  assertModeAllowed();
  const mockMode = isMockMode();

  const base = baseSchema.safeParse(process.env);
  if (!base.success) throw new Error(`Invalid environment variables:\n${formatIssues(base.error)}`);

  if (mockMode) {
    // In demo mode service keys are optional; set ones are still validated.
    const partial = serviceSchema.partial().safeParse(
      Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value !== "")),
    );
    if (!partial.success) throw new Error(`Invalid environment variables:\n${formatIssues(partial.error)}`);
    cached = { ...base.data, ...DEMO_DEFAULTS, ...partial.data, mockMode };
    return cached;
  }

  const services = serviceSchema.safeParse(process.env);
  if (!services.success) {
    throw new Error(`Invalid environment variables (MOCK_MODE=false requires all service keys):\n${formatIssues(services.error)}`);
  }
  cached = { ...base.data, ...services.data, mockMode };
  return cached;
}

/** Full service configuration. Only for real (non-demo) service implementations. */
export function getServiceEnv(): BaseEnv & ServiceEnv {
  const env = getEnv();
  if (env.mockMode) throw new Error("Real service implementation used while MOCK_MODE=true");
  return env as BaseEnv & ServiceEnv;
}

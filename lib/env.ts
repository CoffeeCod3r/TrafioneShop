import { z } from "zod";

import { parseFeedSources } from "@/lib/feeds/config";

/**
 * Server-side environment validation.
 * Import only from server code (route handlers, server actions, server components).
 * Validation is lazy so `next build` and lint do not fail when env vars are absent.
 */

const feedSources = z.string().transform((value, ctx) => {
  try {
    return parseFeedSources(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid FEED_URLS" });
    return z.NEVER;
  }
});

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_SITE_URL: z.url(),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(1024),
  PAID_SEARCH_MAX_SEARCHES: z.coerce.number().int().positive().max(20).default(5),
  PAID_SEARCH_MAX_FETCHES: z.coerce.number().int().positive().max(30).default(15),

  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "Expected a Stripe secret key"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_ID_A: z.string().startsWith("price_"),
  STRIPE_PRICE_ID_B: z.string().startsWith("price_"),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),

  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),

  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://eu.i.posthog.com"),

  CRON_SECRET: z.string().min(32),
  IP_HASH_SALT: z.string().min(32),
  ADMIN_PASSWORD: z.string().min(12),
  FEED_URLS: feedSources,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("lib/env.ts must not be imported in client code");
  }
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Log only variable names, never values.
    const problems = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}

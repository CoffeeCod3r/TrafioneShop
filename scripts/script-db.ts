import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "../lib/db.ts";

/**
 * Supabase client for Node scripts (run with `node --env-file-if-exists=.env.local`).
 * Scripts cannot use the "@/..." alias or lib/env.ts, so they read only what they need.
 */
export function createScriptDb() {
  const env = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    })
    .safeParse(process.env);

  if (!env.success) {
    const names = env.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env vars: ${names}. Fill them in .env.local.`);
  }

  return createClient<Database>(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

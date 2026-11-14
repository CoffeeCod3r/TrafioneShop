import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "../../db.ts";

let client: SupabaseClient<Database> | undefined;

/**
 * Service-role Supabase client (bypasses RLS). Server-only.
 * Reads only the two variables it needs, so Node scripts can use it too.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (typeof window !== "undefined") throw new Error("Supabase service client is server-only");
  if (client) return client;

  const env = z
    .object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
    .safeParse(process.env);
  if (!env.success) {
    const names = env.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid Supabase env vars: ${names}`);
  }

  client = createClient<Database>(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

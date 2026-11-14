-- Defense in depth: the app talks to Postgres only with the service role.
-- Supabase grants anon/authenticated access to new objects in "public" by default;
-- revoke those defaults so a future table or function is never exposed by accident
-- (RLS is still enabled on every table, see earlier migrations).

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- Re-apply to everything that exists now (idempotent).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on function public.consume_rate_limit(text, timestamptz, integer) to service_role;

-- Check (run manually): must return 0 rows.
-- select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

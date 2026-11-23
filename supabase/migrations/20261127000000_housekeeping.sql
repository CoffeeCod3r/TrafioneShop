-- Daily housekeeping that makes the retention promises of the Polityka prywatności true. It runs inside Supabase
-- (pg_cron), not in the app: the site is hosted on Netlify, where the Vercel cron in vercel.json does not run.
--   rate limits (hashed IP / device)       2 days
--   sign-ups never confirmed               7 days
--   quiz answers and results               12 months   (purchases and ai_usage keep their rows, result_id becomes null)
--   clicks, quiz starts                    12 months
-- Payment records (purchases) are kept for the tax period and are not touched.

create extension if not exists pg_cron;

create or replace function public.housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  delete from public.subscribers where confirmed_at is null and consent_at < now() - interval '7 days';
  delete from public.clicks where created_at < now() - interval '12 months';
  delete from public.quiz_starts where created_at < now() - interval '12 months';
  delete from public.results where created_at < now() - interval '12 months';
end;
$$;

revoke all on function public.housekeeping() from public, anon, authenticated;

select cron.schedule('housekeeping-daily', '15 3 * * *', $job$ select public.housekeeping(); $job$);

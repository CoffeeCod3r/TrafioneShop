-- Supabase Cron: every Sunday 02:00 UTC (= 03:00 in Poland in winter, 04:00 in summer) start the catalog check.
-- pg_cron calls the Edge Function `check-links` through pg_net. The function authenticates the call with the
-- same secret as the app (CRON_SECRET), read here from Supabase Vault. Store it once (the value is NOT in this file):
--
--   select vault.create_secret('<the value of CRON_SECRET>', 'cron_secret');
--
-- Without that secret the function answers 403 and nothing runs. Re-running this migration is safe
-- (cron.schedule replaces the job with the same name).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'catalog-check-weekly',
  '0 2 * * 0',
  $job$
  select net.http_post(
    url := 'https://sdnleotwibrtyxodhewi.supabase.co/functions/v1/check-links',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 20000
  );
  $job$
);

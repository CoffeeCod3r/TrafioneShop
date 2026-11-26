-- The pool is now checked every night by GitHub Actions (.github/workflows/nightly-catalog.yml). The weekly Supabase
-- cron of the Edge Function check-links would check the same products a second time with older rules, so it is
-- removed. The Edge Function itself stays deployed but is no longer scheduled.
select cron.unschedule('catalog-check-weekly')
where exists (select 1 from cron.job where jobname = 'catalog-check-weekly');

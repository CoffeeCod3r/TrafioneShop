-- Pool warm-up (scripts/catalog-warmup.ts): its runs go to the same run log, and AI usage under catalog_build.
alter table public.catalog_check_runs
  drop constraint if exists catalog_check_runs_kind_check,
  add constraint catalog_check_runs_kind_check check (kind in ('check', 'nightly', 'warmup'));

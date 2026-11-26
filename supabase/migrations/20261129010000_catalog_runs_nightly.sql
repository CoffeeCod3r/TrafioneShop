-- Nightly pool maintenance report (scripts/catalog-nightly.ts) in the existing run log instead of a second table.
--   kind         check (a verification run) | nightly (the whole night: verify + top-up + tags)
--   added        products added to the pool by the AI top-up
--   ai_cost_usd  AI cost of the night (hard limit NIGHTLY_AI_BUDGET_USD)
--   details      { verifyRunId, cells: [...], budgetExceeded, pool: { active, pending, out_of_stock, broken }, ... }
alter table public.catalog_check_runs
  add column if not exists kind text not null default 'check',
  add column if not exists added integer not null default 0,
  add column if not exists ai_cost_usd numeric(10, 4) not null default 0,
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.catalog_check_runs
  drop constraint if exists catalog_check_runs_kind_check,
  add constraint catalog_check_runs_kind_check check (kind in ('check', 'nightly'));

-- Pool counts per status for the admin panel and the nightly report.
create or replace view public.pool_status_counts
with (security_invoker = true)
as
select status, count(*)::int as products
from public.products
where network <> 'demo'
group by status;

revoke all on public.pool_status_counts from anon, authenticated;

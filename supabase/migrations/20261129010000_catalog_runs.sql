-- Report of the nightly pool job (npm run catalog:nightly, .github/workflows/nightly-catalog.yml): one row per run.
-- The job writes with the service-role key; nothing here is readable from the browser.

create table if not exists public.catalog_runs (
  id                    uuid        primary key default gen_random_uuid(),
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  trigger               text        not null default 'schedule' check (trigger in ('schedule', 'manual')),
  status                text        not null default 'running' check (status in ('running', 'completed', 'stopped_budget', 'failed')),
  -- step a: products fetched and judged / became active (or stayed) / newly broken / newly out of stock / price moved > 20 %
  checked               integer     not null default 0,
  active                integer     not null default 0,
  broken                integer     not null default 0,
  out_of_stock          integer     not null default 0,
  price_changes         integer     not null default 0,
  -- blocked, no data on the page, no shop address, robots.txt: could not be judged
  unverifiable          integer     not null default 0,
  -- step c: new products that were verified and entered the pool
  added                 integer     not null default 0,
  cells_below_threshold integer     not null default 0,
  -- [{"category":"kuchnia","price_bucket":"50-100","recipient":"mom","found":6,"added":4}]
  cells_targeted        jsonb       not null default '[]'::jsonb,
  ai_calls              integer     not null default 0,
  ai_cost_usd           numeric(8, 4) not null default 0 check (ai_cost_usd >= 0),
  duration_ms           integer,
  -- why a step stopped early (budget, time), errors per shop, ...
  notes                 jsonb       not null default '{}'::jsonb
);
create index if not exists catalog_runs_started_idx on public.catalog_runs (started_at desc);

alter table public.catalog_runs enable row level security;
revoke all on table public.catalog_runs from anon, authenticated;

-- The nightly top-up records its AI calls in ai_usage as their own step.
alter table public.ai_usage drop constraint if exists ai_usage_step_check;
alter table public.ai_usage
  add constraint ai_usage_step_check
  check (step in ('profile', 'picks', 'web_search', 'dedications', 'free_web_search', 'catalog_build'));

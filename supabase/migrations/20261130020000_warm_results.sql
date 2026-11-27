-- Ready results for the warmed-up quiz combinations (lib/catalog/warmup.ts): recipient + budget + one interest ->
-- top 5 checked pool products with template reasons. Written by `npm run catalog:warmup` and refreshed every night
-- after the pool check (scripts/catalog-nightly.ts), valid 24 h. A quiz without photo, description and "what they
-- already have" whose recipient, budget and one interest match a healthy row gets it at once, without AI.
create table if not exists public.warm_results (
  combo_key    text        primary key,
  recipient    text        not null,
  budget       integer     not null check (budget > 0),
  interest     text        not null,
  product_ids  uuid[]      not null default '{}',
  reasons      jsonb       not null default '{}'::jsonb,
  summary      text,
  candidates   integer     not null default 0,
  categories   integer     not null default 0,
  healthy      boolean     not null default false,
  refreshed_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists warm_results_lookup_idx on public.warm_results (recipient, budget, interest) where healthy;

alter table public.warm_results enable row level security;
revoke all on table public.warm_results from anon, authenticated;

-- Results served from it are marked free_source = 'warm'.
alter table public.results drop constraint if exists results_free_source_check;
alter table public.results
  add constraint results_free_source_check
  check (free_source in ('web', 'cache', 'catalog', 'catalog_budget', 'catalog_device', 'catalog_fallback', 'warm'));

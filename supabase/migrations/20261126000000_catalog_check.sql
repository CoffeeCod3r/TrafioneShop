-- Weekly catalog check (links and prices): state per product, price history, run log.
-- Purely additive, except the last statement (demo products, see below).

alter table public.products
  -- Consecutive failed checks (timeout, 5xx, block). A product goes out of stock after 2; a good check resets it.
  add column if not exists failed_checks    smallint not null default 0 check (failed_checks >= 0),
  add column if not exists last_check_at    timestamptz,
  -- ok | price_changed | gone_404 | gone_410 | gone_redirect | out_of_stock | error_<reason> | skipped_robots | unverified
  add column if not exists last_check_result text;

-- Price changes of more than 20 % between two checks.
create table if not exists public.price_history (
  id         uuid          primary key default gen_random_uuid(),
  product_id uuid          not null references public.products (id) on delete cascade,
  old_price  numeric(10, 2) not null check (old_price >= 0),
  new_price  numeric(10, 2) not null check (new_price >= 0),
  checked_at timestamptz   not null default now()
);
create index if not exists price_history_product_idx on public.price_history (product_id, checked_at desc);

-- One row per check run (a run may span several Edge Function invocations; `cursor` is where it resumes).
create table if not exists public.catalog_check_runs (
  id                 uuid        primary key default gen_random_uuid(),
  started_by         text        not null default 'cron' check (started_by in ('cron', 'manual')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text        not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  total              integer     not null default 0,
  processed          integer     not null default 0,
  cursor             text,
  ok                 integer     not null default 0,
  price_changes      integer     not null default 0,
  became_unavailable integer     not null default 0,
  skipped_robots     integer     not null default 0,
  unverified         integer     not null default 0,
  errors             integer     not null default 0,
  -- {"shop.pl": {"timeout": 2, "http_5xx": 1}}: error counts by shop and kind
  failures           jsonb       not null default '{}'::jsonb,
  -- guide slugs that still have fewer than 6 available products after the automatic top-up
  guides_incomplete  text[]      not null default '{}'
);
create index if not exists catalog_check_runs_started_idx on public.catalog_check_runs (started_at desc);

alter table public.price_history       enable row level security;
alter table public.catalog_check_runs  enable row level security;
revoke all on table public.price_history, public.catalog_check_runs from anon, authenticated;

-- The 60 demo products (network 'demo') have links to /demo-produkt/..., which exist only in demo mode: on
-- production they are dead. They stay in the table (nothing is deleted) but no longer qualify for results or guides.
update public.products set in_stock = false where network = 'demo' and in_stock;

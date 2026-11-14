-- Initial schema for Prezentownik AI.
-- All tables have RLS enabled and NO policies: anon/authenticated roles get nothing.
-- The app talks to the database only from the server with the service role key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- products: catalog imported from affiliate feeds (free tier)
-- ---------------------------------------------------------------------------

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  network         text not null,
  merchant        text not null,
  external_id     text not null,
  name            text not null,
  description     text,
  price_pln       numeric(10, 2) not null check (price_pln >= 0),
  category        text,
  tags            text[] not null default '{}',
  image_url       text,
  affiliate_url   text not null,
  commission_rate numeric(5, 4) check (commission_rate is null or commission_rate between 0 and 1),
  in_stock        boolean not null default true,
  updated_at      timestamptz not null default now(),
  constraint products_network_external_id_key unique (network, external_id)
);

create index products_category_idx on public.products (category);
create index products_price_pln_idx on public.products (price_pln);
create index products_tags_gin_idx on public.products using gin (tags);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- results: one quiz run (free picks + optional paid web search)
-- ---------------------------------------------------------------------------

create table public.results (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  recipient     text,
  budget_pln    numeric(10, 2) check (budget_pln is null or budget_pln >= 0),
  occasion      text,
  answers       jsonb not null default '{}'::jsonb,
  style_profile text,
  tags          text[] not null default '{}',
  avoid         text[] not null default '{}',
  product_ids   uuid[] not null default '{}',
  reasons       jsonb not null default '{}'::jsonb,
  ref_code      text unique,
  -- Price shown in the A/B test, in grosze (499 = 4.99 PLN, 999 = 9.99 PLN).
  price_variant smallint check (price_variant in (499, 999)),
  paid_status   text not null default 'none'
                check (paid_status in ('none', 'pending', 'searching', 'ready', 'refunded')),
  web_picks     jsonb,
  dedications   jsonb
);

create index results_created_at_idx on public.results (created_at);
create index results_paid_status_idx on public.results (paid_status) where paid_status <> 'none';

-- ---------------------------------------------------------------------------
-- allowed_shops: domains accepted in paid web search
-- ---------------------------------------------------------------------------

create table public.allowed_shops (
  id                uuid primary key default gen_random_uuid(),
  domain            text not null unique check (domain = lower(domain)),
  name              text not null,
  active            boolean not null default true,
  has_affiliate     boolean not null default false,
  -- e.g. https://network.example/click?id=123&url={url}
  deeplink_template text check (deeplink_template is null or position('{url}' in deeplink_template) > 0),
  network           text
);

-- ---------------------------------------------------------------------------
-- clicks: outbound clicks on gift links
-- ---------------------------------------------------------------------------

create table public.clicks (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  result_id  uuid references public.results (id) on delete set null,
  -- null for web search results (products outside our catalog)
  product_id uuid references public.products (id) on delete set null,
  url        text not null,
  source     text not null check (source in ('free', 'web', 'share'))
);

create index clicks_result_id_idx on public.clicks (result_id);
create index clicks_product_id_idx on public.clicks (product_id);
create index clicks_created_at_idx on public.clicks (created_at);

-- ---------------------------------------------------------------------------
-- purchases: Stripe Checkout payments for paid web search
-- ---------------------------------------------------------------------------

create table public.purchases (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- Financial record: keep it even if the result is deleted.
  result_id         uuid references public.results (id) on delete set null,
  stripe_session_id text not null unique,
  payment_intent_id text,
  amount_pln        numeric(10, 2) not null check (amount_pln >= 0),
  price_variant     smallint not null check (price_variant in (499, 999)),
  status            text not null default 'paid' check (status in ('paid', 'refunded'))
);

create index purchases_result_id_idx on public.purchases (result_id);
create index purchases_payment_intent_id_idx on public.purchases (payment_intent_id);

-- ---------------------------------------------------------------------------
-- subscribers: newsletter / occasion reminders (double opt-in)
-- ---------------------------------------------------------------------------

create table public.subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (email = lower(email)),
  consent_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  occasions    text[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters (key = e.g. "quiz:<ip-hash>")
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- ai_usage: token and tool usage per AI call
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  result_id     uuid references public.results (id) on delete set null,
  step          text not null check (step in ('profile', 'picks', 'web_search', 'dedications')),
  model         text not null,
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  web_searches  integer not null default 0 check (web_searches >= 0),
  web_fetches   integer not null default 0 check (web_fetches >= 0)
);

create index ai_usage_result_id_idx on public.ai_usage (result_id);
create index ai_usage_created_at_idx on public.ai_usage (created_at);

-- ---------------------------------------------------------------------------
-- Security: RLS on, no policies, no grants for client roles
-- ---------------------------------------------------------------------------

alter table public.products      enable row level security;
alter table public.results       enable row level security;
alter table public.allowed_shops enable row level security;
alter table public.clicks        enable row level security;
alter table public.purchases     enable row level security;
alter table public.subscribers   enable row level security;
alter table public.rate_limits   enable row level security;
alter table public.ai_usage      enable row level security;

revoke all on table
  public.products,
  public.results,
  public.allowed_shops,
  public.clicks,
  public.purchases,
  public.subscribers,
  public.rate_limits,
  public.ai_usage
from anon, authenticated;

revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- Products of the gift guides (/poradniki/...). Found once by the web search (npm run guides:refresh),
-- saved to `products` (network 'direct') and linked here per guide, so the pages never search on a visit.
-- The refresh replaces a guide's rows once a week. Purely additive.

create table if not exists public.guide_products (
  guide_slug   text        not null check (guide_slug ~ '^[a-z0-9-]{3,80}$'),
  product_id   uuid        not null references public.products (id) on delete cascade,
  position     smallint    not null check (position between 1 and 20),
  -- Short "why this is a good choice" written by the AI for this guide.
  reason       text        not null check (char_length(reason) between 3 and 300),
  refreshed_at timestamptz not null default now(),
  primary key (guide_slug, product_id)
);

create index if not exists guide_products_slug_position_idx on public.guide_products (guide_slug, position);

-- Same security model as the other tables: RLS on, no policies, nothing for client roles.
alter table public.guide_products enable row level security;
revoke all on table public.guide_products from anon, authenticated;

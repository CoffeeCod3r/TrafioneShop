-- Two paid offers: a single web search (4.99 PLN) and a pack of 8 searches (promo price, then regular).
-- A purchase now records which offer it was and how many searches are left to use.
-- Purely additive and backwards compatible with the code that is already deployed.

-- price_variant now stores the price actually charged, in grosze (499, 1299, 1999, ...).
alter table public.purchases drop constraint if exists purchases_price_variant_check;
alter table public.purchases add constraint purchases_price_variant_check check (price_variant > 0);

alter table public.purchases
  add column if not exists offer          text     not null default 'single' check (offer in ('single', 'pack8')),
  add column if not exists searches_total smallint not null default 1 check (searches_total > 0),
  add column if not exists searches_left  smallint not null default 0 check (searches_left >= 0),
  -- Secret code of a pack (kept in a cookie / pack link). Derived from the Stripe session, never guessable.
  add column if not exists pack_code      text unique;

-- (The column check above is auto-named purchases_searches_left_check, so this one needs its own name.)
alter table public.purchases drop constraint if exists purchases_searches_left_lte_total_check;
alter table public.purchases
  add constraint purchases_searches_left_lte_total_check check (searches_left <= searches_total);

-- Atomic use / give-back of one search from a pack. Service role only.
create or replace function public.consume_pack_search(p_id uuid)
returns boolean
language sql
set search_path = ''
as $$
  with used as (
    update public.purchases
       set searches_left = searches_left - 1
     where id = p_id and status = 'paid' and searches_left > 0
    returning 1
  )
  select exists (select 1 from used);
$$;

create or replace function public.restore_pack_search(p_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.purchases
     set searches_left = least(searches_left + 1, searches_total)
   where id = p_id and status = 'paid';
$$;

revoke execute on function public.consume_pack_search(uuid) from public, anon, authenticated;
revoke execute on function public.restore_pack_search(uuid) from public, anon, authenticated;
grant execute on function public.consume_pack_search(uuid) to service_role;
grant execute on function public.restore_pack_search(uuid) to service_role;

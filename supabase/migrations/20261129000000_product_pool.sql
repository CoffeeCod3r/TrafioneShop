-- Product pool: the main source of free results. A product is shown for free only when it is `active` and was
-- verified (link, price, availability) less than 7 days ago. The nightly job (npm run catalog:nightly) keeps the pool
-- verified and tops it up; see lib/catalog/*. Additive: the old columns (in_stock, failed_checks, last_check_at, ...)
-- stay and are kept in sync by a trigger, so the older code paths (guides, weekly check, feed import) keep working.

alter table public.products
  add column if not exists status          text not null default 'pending',
  add column if not exists last_checked_at timestamptz,
  add column if not exists fail_count      integer not null default 0 check (fail_count >= 0),
  -- The price seen on the shop's page at the last successful check (price_pln follows it).
  add column if not exists price_checked   numeric(10, 2) check (price_checked is null or price_checked >= 0),
  add column if not exists source          text not null default 'manual';

alter table public.products drop constraint if exists products_status_check;
alter table public.products
  add constraint products_status_check check (status in ('active', 'out_of_stock', 'broken', 'pending'));
alter table public.products drop constraint if exists products_source_check;
alter table public.products
  add constraint products_source_check check (source in ('catalog_build', 'feed', 'manual'));

-- Existing rows: status follows in_stock. A product that was never checked gets updated_at as its "last seen" time, so
-- the pool does not go empty on the day this migration runs; the nightly job re-verifies it within the 7 day window.
update public.products
set status          = case when in_stock then 'active' else 'out_of_stock' end,
    last_checked_at = coalesce(last_check_at, checked_at, updated_at),
    fail_count      = failed_checks,
    price_checked   = case when checked_at is not null then price_pln end,
    source          = case network when 'direct' then 'catalog_build' when 'demo' then 'manual' else 'feed' end;

create index if not exists products_pool_idx on public.products (last_checked_at) where status = 'active';
create index if not exists products_status_idx on public.products (status);

-- Keeps status and in_stock consistent whichever of them a writer changes:
--  * the new verifier writes status           -> in_stock = (status = 'active');
--  * the feed import / old weekly check write in_stock:
--      true -> false: out_of_stock (a broken product stays broken);
--      false -> true: pending (it must be verified again before it is shown).
create or replace function public.products_sync_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.in_stock := (new.status = 'active');
  elsif new.in_stock is distinct from old.in_stock then
    if new.in_stock then
      if old.status <> 'active' then new.status := 'pending'; end if;
    elsif old.status in ('active', 'pending') then
      new.status := 'out_of_stock';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_status on public.products;
create trigger products_sync_status
  before update on public.products
  for each row execute function public.products_sync_status();

-- Folds a feed category ("Kuchnia > Akcesoria", "Podróże") into one of the 12 pool categories
-- (the same list as lib/illustrations.ts); anything else stays as it is and is not part of the coverage grid.
create or replace function public.pool_category(raw text)
returns text
language sql
immutable
as $$
  select case c when 'zywnosc' then 'jedzenie' when 'zabawki' then 'gry' when 'turystyka' then 'podroze' else c end
  from (select translate(lower(btrim(split_part(coalesce(raw, ''), '>', 1))), 'ąćęłńóśźż', 'acelnoszz') as c) t
$$;

-- Active, fresh products per category x price range x recipient. A product with no recipients fits everyone.
-- Health threshold: at least 8 per cell (lib/catalog/pool.ts POOL_MIN_PER_CELL).
create or replace view public.pool_coverage
with (security_invoker = true) as
with
  cats(category) as (
    values ('dom'), ('ogrod'), ('kuchnia'), ('jedzenie'), ('ksiazki'), ('gry'), ('elektronika'), ('sport'),
           ('moda'), ('uroda'), ('hobby'), ('podroze')
  ),
  buckets(price_bucket, lo_excl, hi_incl) as (
    values ('do-50', -1::numeric, 50::numeric), ('50-100', 50, 100), ('100-200', 100, 200), ('200+', 200, null)
  ),
  recips(recipient) as (
    values ('dad'), ('mom'), ('girlfriend'), ('boyfriend'), ('friend'), ('boss'), ('grandparent')
  )
select
  c.category,
  b.price_bucket,
  r.recipient,
  count(p.id)::int as active_count,
  8 as threshold,
  count(p.id) < 8 as below_threshold
from cats c
cross join buckets b
cross join recips r
left join public.products p
  on p.status = 'active'
 and p.last_checked_at >= now() - interval '7 days'
 and public.pool_category(p.category) = c.category
 and p.price_pln > b.lo_excl
 and (b.hi_incl is null or p.price_pln <= b.hi_incl)
 and (cardinality(p.recipients) = 0 or r.recipient = any (p.recipients))
group by c.category, b.price_bucket, r.recipient;

revoke all on table public.pool_coverage from anon, authenticated;

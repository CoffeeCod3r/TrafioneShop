-- Product pool: the main source of free results, kept healthy by the nightly check (lib/catalog-check) and topped
-- up where it is thin (lib/catalog-build). Builds on the columns of 20261126000000_catalog_check.sql instead of
-- duplicating them: failed_checks is the fail counter, last_check_at the time of the last check.
--
-- status       active (checked, in stock) | pending (not checked yet) | out_of_stock | broken (gone: 2 failed checks)
-- in_stock     stays the flag every query uses; a trigger keeps it equal to status in ('active', 'pending'), so the
--              feed import, the web search (Edge Function) and older code that only set in_stock keep working.
-- source       catalog_build (nightly AI top-up) | feed (partner feed, e.g. Ceneo) | web_search (free/paid search) | manual
-- price_checked  the price read from the shop page in the last successful check
-- final_url      the address after redirects in the last check

alter table public.products
  add column if not exists status text,
  add column if not exists source text,
  add column if not exists price_checked numeric(10, 2),
  add column if not exists final_url text;

update public.products
set status = case
      when network = 'demo' then 'broken'
      when not in_stock then 'out_of_stock'
      else 'pending'
    end
where status is null;

update public.products
set source = case network when 'direct' then 'web_search' when 'demo' then 'manual' else 'feed' end
where source is null;

alter table public.products
  alter column status set not null,
  alter column source set default 'feed',
  alter column source set not null,
  drop constraint if exists products_status_check,
  add constraint products_status_check check (status in ('active', 'pending', 'out_of_stock', 'broken')),
  drop constraint if exists products_source_check,
  add constraint products_source_check check (source in ('catalog_build', 'feed', 'web_search', 'manual'));

create or replace function public.products_sync_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.in_stock then 'pending' else 'out_of_stock' end;
    end if;
    new.in_stock := new.status in ('active', 'pending');
    return new;
  end if;

  if new.status is distinct from old.status then
    new.in_stock := new.status in ('active', 'pending');
  elsif new.in_stock is distinct from old.in_stock then
    new.status := case
      when new.in_stock then (case when old.status in ('active', 'pending') then old.status else 'pending' end)
      when old.status = 'broken' then 'broken'
      else 'out_of_stock'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_status on public.products;
create trigger products_sync_status
  before insert or update on public.products
  for each row execute function public.products_sync_status();

create index if not exists products_status_check_idx on public.products (status, last_check_at);

-- Pool coverage: active products (checked in the last 7 days) per category × price band × recipient.
-- A product with no recipients fits every recipient. A cell is healthy with at least 8 products.
create or replace view public.pool_coverage
with (security_invoker = true)
as
with recipients(recipient) as (
  values ('dad'), ('mom'), ('girlfriend'), ('boyfriend'), ('friend'), ('boss'), ('grandparent')
),
bands(band, band_order, min_price, max_price) as (
  values ('do 50', 1, 0, 50), ('50-100', 2, 50, 100), ('100-200', 3, 100, 200), ('200+', 4, 200, 1000000)
),
categories as (
  select distinct category from public.products where network <> 'demo' and category is not null
),
fresh as (
  select category, price_pln, recipients
  from public.products
  where status = 'active' and last_check_at > now() - interval '7 days'
)
select
  c.category,
  b.band,
  b.band_order,
  r.recipient,
  count(f.category) as active,
  count(f.category) >= 8 as healthy
from categories c
cross join bands b
cross join recipients r
left join fresh f
  on f.category = c.category
 and f.price_pln > b.min_price and f.price_pln <= b.max_price
 and (cardinality(f.recipients) = 0 or r.recipient = any (f.recipients))
group by c.category, b.band, b.band_order, r.recipient;

revoke all on public.pool_coverage from anon, authenticated;

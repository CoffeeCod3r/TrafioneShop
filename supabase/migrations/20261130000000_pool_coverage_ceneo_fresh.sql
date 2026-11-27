-- Ceneo pages may only be read slowly (60 per night, a full round of ~900 products takes ~15 nights, see
-- lib/catalog-check/domains.ts), so a Ceneo check stays valid for 21 days instead of 7 (FRESH_DAYS_BY_NETWORK in
-- lib/catalog-build/coverage.ts). Otherwise Ceneo products would never count as fresh in the pool coverage.
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
  where status = 'active'
    and last_check_at > now() - (case when network = 'ceneo' then 21 else 7 end) * interval '1 day'
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

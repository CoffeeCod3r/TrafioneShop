-- Pack of 10 searches for 14.99 PLN replaces the pack of 8 (12.99 PLN promo, then 19.99 PLN).
-- The new offer id is 'pack10'. 'pack8' stays valid for purchases already made under it.
-- Purely additive: only the allowed values of purchases.offer change.

alter table public.purchases drop constraint if exists purchases_offer_check;
alter table public.purchases
  add constraint purchases_offer_check
  check (offer in ('single', 'pack8', 'pack10'));

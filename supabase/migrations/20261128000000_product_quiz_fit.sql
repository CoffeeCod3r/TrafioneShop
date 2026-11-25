-- Which quiz answers a product fits, so candidate ranking can match the whole quiz, not only the interests.
-- Values are the quiz codes from lib/quiz/schema.ts. An empty array means "fits any answer".
-- recipients: a product with a non-empty list is shown only for those recipients
--   (children's items have recipients = '{none}', there is no child option in the quiz).
-- gift_types and lifestyles only raise the ranking, they never exclude a product.
alter table public.products
  add column if not exists recipients text[] not null default '{}',
  add column if not exists gift_types text[] not null default '{}',
  add column if not exists lifestyles text[] not null default '{}';

create index if not exists products_recipients_idx on public.products using gin (recipients);

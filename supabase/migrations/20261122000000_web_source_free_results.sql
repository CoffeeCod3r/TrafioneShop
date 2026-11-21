-- Free results from a web search in trusted shops (SOURCE_MODE=web).
-- Purely additive: existing rows keep working (search_status defaults to 'ready').

-- Products found on the web and verified by the search (network = 'direct', commission_rate = 0).
alter table public.products
  add column if not exists url        text,
  add column if not exists checked_at timestamptz;

-- Free result state: the search runs in a Supabase Edge Function, the page polls this status.
alter table public.results
  add column if not exists search_status     text not null default 'ready'
    check (search_status in ('searching', 'ready')),
  -- Where the free picks came from (admin stats): a fresh web search, the 24 h result memory,
  -- or the catalog (budget / device limit reached / web search failed).
  add column if not exists free_source       text
    check (free_source in ('web', 'cache', 'catalog', 'catalog_budget', 'catalog_device', 'catalog_fallback')),
  -- Salted hash of the quiz answers (never the photo), set only on results that came from a web search.
  add column if not exists quiz_hash         text,
  add column if not exists search_started_at timestamptz;

create index if not exists results_quiz_hash_idx
  on public.results (quiz_hash, created_at) where quiz_hash is not null;
create index if not exists results_search_status_idx
  on public.results (search_status) where search_status <> 'ready';

-- Click sources: 'free-web' (free pick found on the web), 'paid-web' (paid search),
-- 'catalog' (partner catalog). Old values stay valid.
alter table public.clicks drop constraint if exists clicks_source_check;
alter table public.clicks
  add constraint clicks_source_check
  check (source in ('free', 'web', 'share', 'free-web', 'paid-web', 'catalog'));

-- AI usage of the free web search is counted separately from the paid one.
alter table public.ai_usage drop constraint if exists ai_usage_step_check;
alter table public.ai_usage
  add constraint ai_usage_step_check
  check (step in ('profile', 'picks', 'web_search', 'dedications', 'free_web_search'));

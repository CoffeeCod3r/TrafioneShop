-- AI usage of the nightly pool top-up (scripts/catalog-nightly.ts): catalog_build (web search for thin pool cells)
-- and catalog_tag (tags for untagged products).
alter table public.ai_usage drop constraint if exists ai_usage_step_check;
alter table public.ai_usage
  add constraint ai_usage_step_check
  check (step in ('profile', 'picks', 'web_search', 'dedications', 'free_web_search', 'catalog_build', 'catalog_tag'));

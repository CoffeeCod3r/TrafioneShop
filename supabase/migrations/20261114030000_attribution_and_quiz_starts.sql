-- Attribution and funnel counting for the admin panel.
-- results.source: utm_source of the visit, or "ref:<ref_code>" when it came from a shared result.
-- quiz_starts: anonymous counter of started quizzes (no personal data, no cookies),
-- used for the completion rate and revenue per visit.

alter table public.results add column if not exists source text
  check (source is null or (char_length(source) <= 80 and source ~ '^[a-z0-9_:.-]+$'));

create index if not exists results_source_idx on public.results (source);

create table if not exists public.quiz_starts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source     text check (source is null or (char_length(source) <= 80 and source ~ '^[a-z0-9_:.-]+$'))
);

create index if not exists quiz_starts_created_at_idx on public.quiz_starts (created_at);

alter table public.quiz_starts enable row level security;
revoke all on table public.quiz_starts from anon, authenticated;

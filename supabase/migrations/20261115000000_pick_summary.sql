-- Short AI explanation shown above the free picks: which gift fits the recipient best and why.
alter table public.results add column if not exists pick_summary text
  check (pick_summary is null or char_length(pick_summary) <= 800);

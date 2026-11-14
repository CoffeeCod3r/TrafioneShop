-- Atomic fixed-window rate limiting.
-- Returns true and increments the counter if the key is under the limit for this window,
-- false otherwise. Called only from the server with the service role key.

create or replace function public.consume_rate_limit(
  p_key text,
  p_window_start timestamptz,
  p_limit integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
    do update set count = rl.count + 1
    where rl.count < p_limit
  returning rl.count into v_count;

  return v_count is not null;
end;
$$;

revoke execute on function public.consume_rate_limit(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, timestamptz, integer) to service_role;

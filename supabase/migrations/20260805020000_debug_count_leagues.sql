create or replace function debug_count_leagues()
returns table (total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from league;
$$;

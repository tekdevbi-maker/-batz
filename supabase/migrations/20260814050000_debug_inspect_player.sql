-- Temporary debug RPC, dropped in the next migration once the
-- coach-driven-unlock "Settings vanishing" repro (brian@test.com) is
-- diagnosed.
create or replace function debug_inspect_player(p_query text)
returns table (
  player_id uuid,
  player_tag text,
  first_name text,
  last_name text,
  is_coach_fallback boolean,
  parent_user_id uuid,
  parent_email text,
  parent_attested_at timestamptz,
  newly_assigned boolean,
  roster_entry_id uuid,
  team_id uuid,
  team_name text,
  season_status text,
  uniform_number int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.player_tag, p.first_name, p.last_name, p.is_coach_fallback,
    p.parent_user_id, u.email::text, p.parent_attested_at, p.newly_assigned,
    re.id, re.team_id, t.name, t.season_status, re.uniform_number
  from player p
  left join auth.users u on u.id = p.parent_user_id
  left join roster_entry re on re.player_id = p.id
  left join team t on t.id = re.team_id
  where u.email ilike '%' || p_query || '%'
     or p.player_tag ilike '%' || p_query || '%'
     or p.first_name ilike '%' || p_query || '%'
     or p.last_name ilike '%' || p_query || '%';
$$;

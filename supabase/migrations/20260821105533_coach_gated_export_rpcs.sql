-- Both CSV export paths (per-game Export button and the new Season
-- Totals export) were fetching game_batting_stat/roster_entry with plain
-- client-side selects, which are subject to the Section 7 visibility RLS
-- (can_view_player/can_view_stat_line -- 20260719204809_open_stats_visibility_model.sql).
-- That RLS is correctly restrictive for public display (a Private
-- player's stats are only visible to same-division coaches/parents while
-- their team is in-season), but wrong here: a coach exporting THEIR OWN
-- team's data is a recordkeeping action, not a public stats view, and
-- should always see every player regardless of visibility_scope or
-- season status. Result before this fix: any claimed player who wasn't
-- Public (or wasn't the viewer's own child) silently vanished from every
-- CSV export -- exactly the "only 1 player" bug reported.
--
-- Both RPCs are SECURITY DEFINER (bypass RLS entirely) but gate on the
-- caller actually being a coach (any role) on the team, same check
-- isCoachOnTeam/get_team_members use elsewhere.
create or replace function get_team_game_stat_lines(p_team_id uuid, p_game_id uuid default null)
returns table (
  game_id uuid,
  roster_entry_id uuid,
  uniform_number smallint,
  first_name text,
  last_name text,
  ab smallint, h smallint, singles smallint, doubles smallint, triples smallint,
  hr smallint, rbi smallint, bb smallint, hbp smallint, sf smallint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from coach_assignment ca where ca.team_id = p_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  return query
  select gbs.game_id, re.id, re.uniform_number, re.first_name, re.last_name,
         gbs.ab, gbs.h, gbs.singles, gbs.doubles, gbs.triples, gbs.hr, gbs.rbi, gbs.bb, gbs.hbp, gbs.sf
  from game_batting_stat gbs
  join roster_entry re on re.id = gbs.roster_entry_id
  join game g on g.id = gbs.game_id
  where g.team_id = p_team_id
    and (p_game_id is null or gbs.game_id = p_game_id);
end;
$$;

-- One row per CURRENT roster spot (LEFT JOIN, so a player who never
-- batted still shows up with zero totals instead of vanishing), summed
-- across every game recorded for the team this season.
create or replace function get_team_season_totals(p_team_id uuid)
returns table (
  roster_entry_id uuid,
  uniform_number smallint,
  first_name text,
  last_name text,
  ab bigint, h bigint, singles bigint, doubles bigint, triples bigint,
  hr bigint, rbi bigint, bb bigint, hbp bigint, sf bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from coach_assignment ca where ca.team_id = p_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  return query
  select re.id, re.uniform_number, re.first_name, re.last_name,
         coalesce(sum(gbs.ab), 0), coalesce(sum(gbs.h), 0), coalesce(sum(gbs.singles), 0),
         coalesce(sum(gbs.doubles), 0), coalesce(sum(gbs.triples), 0), coalesce(sum(gbs.hr), 0),
         coalesce(sum(gbs.rbi), 0), coalesce(sum(gbs.bb), 0), coalesce(sum(gbs.hbp), 0), coalesce(sum(gbs.sf), 0)
  from roster_entry re
  left join game_batting_stat gbs on gbs.roster_entry_id = re.id
  where re.team_id = p_team_id
  group by re.id, re.uniform_number, re.first_name, re.last_name
  order by re.uniform_number;
end;
$$;

-- sum() over a smallint column returns bigint, which PostgREST serializes
-- as a JSON string (not a number) since JS can't safely represent the
-- full bigint range -- would've silently turned every count in the
-- Season Totals CSV into a string. A season's totals never come close to
-- overflowing int4, so cast down explicitly instead. Return type is
-- changing, so this needs a drop, not just create-or-replace.
drop function if exists get_team_season_totals(uuid);

create or replace function get_team_season_totals(p_team_id uuid)
returns table (
  roster_entry_id uuid,
  uniform_number smallint,
  first_name text,
  last_name text,
  ab int, h int, singles int, doubles int, triples int,
  hr int, rbi int, bb int, hbp int, sf int
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
         coalesce(sum(gbs.ab), 0)::int, coalesce(sum(gbs.h), 0)::int, coalesce(sum(gbs.singles), 0)::int,
         coalesce(sum(gbs.doubles), 0)::int, coalesce(sum(gbs.triples), 0)::int, coalesce(sum(gbs.hr), 0)::int,
         coalesce(sum(gbs.rbi), 0)::int, coalesce(sum(gbs.bb), 0)::int, coalesce(sum(gbs.hbp), 0)::int, coalesce(sum(gbs.sf), 0)::int
  from roster_entry re
  left join game_batting_stat gbs on gbs.roster_entry_id = re.id
  where re.team_id = p_team_id
  group by re.id, re.uniform_number, re.first_name, re.last_name
  order by re.uniform_number;
end;
$$;

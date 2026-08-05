do $$
declare
  r record;
begin
  for r in
    select t.id, t.name, t.division_id, t.sport, t.season, t.year, t.season_status, t.created_at,
           d.name as division_name, l.name as league_name,
           (select count(*) from coach_assignment ca where ca.team_id = t.id) as coach_count,
           (select count(*) from roster_entry re where re.team_id = t.id) as roster_count,
           (select count(*) from game g where g.team_id = t.id) as game_count
    from team t
    join division d on d.id = t.division_id
    join league l on l.id = d.league_id
    where t.name = 'Rays'
    order by t.created_at
  loop
    raise notice 'team=% created=% division=%(%) league=% season=%/% status=% coaches=% roster=% games=%',
      r.id, r.created_at, r.division_name, r.division_id, r.league_name, r.season, r.year, r.season_status,
      r.coach_count, r.roster_count, r.game_count;
  end loop;

  for r in
    select ca.team_id, ca.user_id, ca.role, ca.first_name, ca.last_name, ca.created_at
    from coach_assignment ca
    join team t on t.id = ca.team_id
    where t.name = 'Rays'
    order by ca.created_at
  loop
    raise notice 'coach_assignment team=% user=% role=% name=% % created=%',
      r.team_id, r.user_id, r.role, r.first_name, r.last_name, r.created_at;
  end loop;
end $$;

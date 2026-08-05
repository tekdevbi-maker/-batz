do $$
declare
  r record;
begin
  for r in
    select re.id as roster_entry_id, re.uniform_number, re.created_by_game_id,
           p.id as player_id, p.first_name, p.last_name, p.is_coach_fallback, p.parent_user_id,
           (select count(*) from game_batting_stat gbs where gbs.roster_entry_id = re.id) as stat_row_count
    from roster_entry re
    left join player p on p.id = re.player_id
    where re.team_id = 'c066c635-4857-479b-ab8a-199c83bb60c5'
    order by re.uniform_number
  loop
    raise notice 'roster_entry=% uniform=% created_by_game_id=% player=% (% %) is_coach_fallback=% parent=% stat_rows=%',
      r.roster_entry_id, r.uniform_number, r.created_by_game_id, r.player_id, r.first_name, r.last_name,
      r.is_coach_fallback, r.parent_user_id, r.stat_row_count;
  end loop;
end $$;

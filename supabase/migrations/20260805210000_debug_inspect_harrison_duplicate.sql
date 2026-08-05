do $$
declare
  r record;
begin
  for r in
    select p.id as player_id, p.first_name, p.last_name, p.parent_user_id, p.is_coach_fallback,
           p.player_tag, p.created_at as player_created_at,
           re.id as roster_entry_id, re.team_id, re.uniform_number, re.created_by_game_id, re.created_at as re_created_at,
           t.name as team_name
    from player p
    left join roster_entry re on re.player_id = p.id
    left join team t on t.id = re.team_id
    where p.first_name = 'Harrison' and p.last_name = 'Flositz'
    order by p.created_at
  loop
    raise notice 'player=% tag=% parent=% is_coach_fallback=% player_created=% | roster_entry=% team=%(%) uniform=% created_by_game=% re_created=%',
      r.player_id, r.player_tag, r.parent_user_id, r.is_coach_fallback, r.player_created_at,
      r.roster_entry_id, r.team_name, r.team_id, r.uniform_number, r.created_by_game_id, r.re_created_at;
  end loop;
end $$;

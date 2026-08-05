create or replace function debug_setup_orphan_test(p_team_id uuid)
returns table (game_id uuid, unclaimed_re uuid, claimed_re uuid, stats_elsewhere_re uuid, claimed_player uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
  v_other_game uuid;
  v_re1 uuid; -- will be left unclaimed, no other-game stats -> should be deleted
  v_re2 uuid; -- will be claimed by a real parent -> should survive
  v_re3 uuid; -- will get stats in another game too -> should survive
  v_player2 uuid;
  v_head_coach uuid;
begin
  select ca.user_id into v_head_coach from coach_assignment ca where ca.team_id = p_team_id and ca.role = 'primary';

  insert into game (team_id, game_date, game_number, opponent, file_hash)
  values (p_team_id, '2026-08-05', 9001, 'Orphan Test Opponent', 'debugtesthash1')
  returning id into v_game;

  insert into game (team_id, game_date, game_number, opponent, file_hash)
  values (p_team_id, '2026-08-06', 9002, 'Other Game', 'debugtesthash2')
  returning id into v_other_game;

  insert into roster_entry (team_id, uniform_number, first_name, last_name, created_by_game_id)
  values (p_team_id, 91, 'Orphan', 'Unclaimed', v_game) returning id into v_re1;
  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach, 'Orphan', 'Unclaimed', 'DebugOrphanTag1', true)
  returning id into v_player2;
  update roster_entry set player_id = v_player2 where id = v_re1;

  insert into roster_entry (team_id, uniform_number, first_name, last_name, created_by_game_id)
  values (p_team_id, 92, 'Orphan', 'ButClaimed', v_game) returning id into v_re2;
  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach, 'Orphan', 'ButClaimed', 'DebugOrphanTag2', false)
  returning id into v_player2;
  update roster_entry set player_id = v_player2 where id = v_re2;

  insert into roster_entry (team_id, uniform_number, first_name, last_name, created_by_game_id)
  values (p_team_id, 93, 'Orphan', 'OtherGameStats', v_game) returning id into v_re3;
  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach, 'Orphan', 'OtherGameStats', 'DebugOrphanTag3', true)
  returning id into v_player2;
  update roster_entry set player_id = v_player2 where id = v_re3;

  insert into game_batting_stat (game_id, roster_entry_id, ab, h) values (v_game, v_re1, 3, 1);
  insert into game_batting_stat (game_id, roster_entry_id, ab, h) values (v_game, v_re2, 3, 1);
  insert into game_batting_stat (game_id, roster_entry_id, ab, h) values (v_game, v_re3, 3, 1);
  insert into game_batting_stat (game_id, roster_entry_id, ab, h) values (v_other_game, v_re3, 2, 1);

  return query select v_game, v_re1, v_re2, v_re3, v_player2;
end;
$$;

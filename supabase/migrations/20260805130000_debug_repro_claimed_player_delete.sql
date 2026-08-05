-- Debug: reproduce "claimed player disappears after deleting all games"
-- against the real Rays team, using the real delete_game_and_cleanup_roster
-- RPC body (just without its auth.uid() coach-check, since this runs as a
-- migration, not a real user session).
do $$
declare
  v_team_id uuid := 'c066c635-4857-479b-ab8a-199c83bb60c5';
  v_head_coach uuid;
  v_game uuid;
  v_re uuid;
  v_player uuid;
  v_orphan_ids uuid[];
begin
  select ca.user_id into v_head_coach from coach_assignment ca where ca.team_id = v_team_id and ca.role = 'primary';

  insert into game (team_id, game_date, game_number, opponent, file_hash)
  values (v_team_id, '2026-08-05', 1, 'Debug Opponent', 'debugclaimtest1')
  returning id into v_game;

  insert into roster_entry (team_id, uniform_number, first_name, last_name, created_by_game_id)
  values (v_team_id, 77, 'Debug', 'Claimed', v_game)
  returning id into v_re;

  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach, 'Debug', 'Claimed', 'DebugClaimTag1', true)
  returning id into v_player;

  update roster_entry set player_id = v_player where id = v_re;

  insert into game_batting_stat (game_id, roster_entry_id, ab, h) values (v_game, v_re, 3, 1);

  -- Simulate the real "I'm the Parent" attest: is_coach_fallback -> false.
  update player set is_coach_fallback = false, parent_attested_at = now() where id = v_player;

  raise notice 'BEFORE delete: player exists=%, roster_entry exists=%',
    (select exists(select 1 from player where id = v_player)),
    (select exists(select 1 from roster_entry where id = v_re));

  -- Inline copy of delete_game_and_cleanup_roster's orphan-detection query.
  select array_agg(re.player_id) into v_orphan_ids
  from roster_entry re
  join player p on p.id = re.player_id
  where re.created_by_game_id = v_game
    and p.is_coach_fallback = true
    and not exists (select 1 from game_batting_stat gbs where gbs.roster_entry_id = re.id and gbs.game_id <> v_game);

  raise notice 'orphan_ids computed = %', v_orphan_ids;

  delete from game where id = v_game;

  if v_orphan_ids is not null then
    delete from roster_entry where player_id = any(v_orphan_ids);
    delete from player where id = any(v_orphan_ids);
  end if;

  raise notice 'AFTER delete: player exists=%, roster_entry exists=%',
    (select exists(select 1 from player where id = v_player)),
    (select exists(select 1 from roster_entry where id = v_re));

  -- Clean up this debug player regardless of outcome (test data only).
  delete from roster_entry where id = v_re;
  delete from player where id = v_player;
end $$;

-- One-time retroactive sweep for the Rays team: apply the same "wipe any
-- roster spot with zero stats anywhere" policy from 20260805180000 now,
-- since all of Rays' games were already deleted before that fix landed
-- and there's no future game-delete left to trigger it naturally.
do $$
declare
  v_team_id uuid := 'c066c635-4857-479b-ab8a-199c83bb60c5';
  v_empty_player_ids uuid[];
begin
  select array_agg(re.player_id) into v_empty_player_ids
  from roster_entry re
  where re.team_id = v_team_id
    and not exists (select 1 from game_batting_stat gbs where gbs.roster_entry_id = re.id);

  if v_empty_player_ids is not null then
    delete from roster_entry where player_id = any(v_empty_player_ids);
    delete from player
    where id = any(v_empty_player_ids)
      and not exists (select 1 from roster_entry re2 where re2.player_id = player.id);
  end if;
end $$;

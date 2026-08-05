-- Deleting a game (e.g. a coach who imported the wrong team's file) used
-- to leave behind every roster_entry/player that import auto-created --
-- the stats were gone, but the player cards stayed cluttering the roster
-- forever. Tracks which game (if any) a roster_entry was auto-created by,
-- and on delete, removes any such spot that's still unclaimed and has no
-- batting stats left from any OTHER game. A spot a real parent has since
-- claimed, or that picked up stats from a later game, is left alone.

alter table roster_entry
  add column if not exists created_by_game_id uuid references game (id) on delete set null;

create or replace function delete_game_and_cleanup_roster(p_game_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_orphan_player_ids uuid[];
begin
  select team_id into v_team_id from game where id = p_game_id;
  if v_team_id is null then
    raise exception 'game_not_found';
  end if;

  if not (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = auth.uid())
  ) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  -- Roster spots this specific import created, still unclaimed, and with
  -- no batting stats surviving from any OTHER game -- computed before the
  -- delete below removes this game's own stat rows.
  select array_agg(re.player_id) into v_orphan_player_ids
  from roster_entry re
  join player p on p.id = re.player_id
  where re.created_by_game_id = p_game_id
    and p.is_coach_fallback = true
    and not exists (
      select 1 from game_batting_stat gbs
      where gbs.roster_entry_id = re.id and gbs.game_id <> p_game_id
    );

  -- Cascades away this game's own game_batting_stat rows, which is what
  -- frees the orphan roster_entry rows below from their FK reference.
  delete from game where id = p_game_id;

  if v_orphan_player_ids is not null then
    delete from roster_entry where player_id = any(v_orphan_player_ids);
    delete from player where id = any(v_orphan_player_ids);
  end if;
end;
$$;

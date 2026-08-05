-- Per explicit direction: deleting a game should wipe out ANY roster spot
-- left with zero batting-stat rows anywhere -- claimed or not, not just
-- the unclaimed/coach-fallback ones. If a parent's claimed player ends up
-- with no games recorded at all, the spot disappears too; the parent
-- re-claims once a new game is imported and recreates it. This drops the
-- `is_coach_fallback = true` restriction that previously protected
-- claimed players from ever being touched by this cleanup.
--
-- Safety kept: a player is only deleted outright if it has no OTHER
-- roster_entry anywhere (i.e. no history on a different team/season) --
-- a player with real career stats elsewhere must never be deleted just
-- because this particular team's spot emptied out.
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

  -- Team-wide: any roster spot (claimed or not) with no batting stats
  -- surviving from any OTHER game -- computed before the delete below
  -- removes this game's own stat rows.
  select array_agg(re.player_id) into v_orphan_player_ids
  from roster_entry re
  join player p on p.id = re.player_id
  where re.team_id = v_team_id
    and not exists (
      select 1 from game_batting_stat gbs
      where gbs.roster_entry_id = re.id and gbs.game_id <> p_game_id
    );

  delete from game where id = p_game_id;

  if v_orphan_player_ids is not null then
    delete from roster_entry where player_id = any(v_orphan_player_ids);
    delete from player
    where id = any(v_orphan_player_ids)
      and not exists (select 1 from roster_entry re2 where re2.player_id = player.id);
  end if;
end;
$$;

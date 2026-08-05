-- Reversal of 20260805180000's "claimed or not" broadening: a player a
-- real parent has claimed must stay on that parent's profile permanently,
-- even if the coach deletes every game for the season. Only an unclaimed
-- (is_coach_fallback = true) roster spot -- one nobody has claimed yet --
-- gets swept away once it has zero batting-stat rows left anywhere. The
-- team-wide scoping fix from 20260805150000 (not keyed to which specific
-- game created the spot) is kept.
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

  -- Team-wide: any UNCLAIMED roster spot with no batting stats surviving
  -- from any OTHER game -- computed before the delete below removes this
  -- game's own stat rows. A claimed player is never included here.
  select array_agg(re.player_id) into v_orphan_player_ids
  from roster_entry re
  join player p on p.id = re.player_id
  where re.team_id = v_team_id
    and p.is_coach_fallback = true
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

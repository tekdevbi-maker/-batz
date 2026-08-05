-- Bug: delete_game_and_cleanup_roster scoped orphan detection to
-- `created_by_game_id = p_game_id`, but that column is
-- `on delete set null` -- so the moment the ORIGIN game of a kept roster
-- spot (a claimed player, or one with stats in another game) gets
-- deleted, its created_by_game_id is nulled out as a side effect, even
-- though the row itself correctly survived. From then on that spot can
-- never be matched by created_by_game_id again, so once its last
-- surviving game is later deleted too, it's never re-evaluated and sticks
-- around forever with zero stats anywhere -- exactly the stale-roster-card
-- problem this function was written to prevent.
--
-- Fix: stop keying orphan detection off which specific game originally
-- created the spot. Instead, on every game delete, sweep the whole team
-- for any still-unclaimed (is_coach_fallback) roster spot that will have
-- zero batting-stat rows left anywhere once this game's own stats are
-- gone. Every roster_entry created by an import always gets at least one
-- (possibly all-zero) game_batting_stat row in its origin game, so "zero
-- stat rows anywhere" reliably means "no game references this spot
-- anymore" regardless of which game created it or how many games have
-- been deleted since.
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

  -- Team-wide: any unclaimed spot with no batting stats surviving from any
  -- OTHER game -- computed before the delete below removes this game's
  -- own stat rows.
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
    delete from player where id = any(v_orphan_player_ids);
  end if;
end;
$$;

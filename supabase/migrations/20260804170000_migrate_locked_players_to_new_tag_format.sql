-- Phase 6 of the locked-player/COPPA rework: existing locked
-- (is_coach_fallback) players were tagged with the OLD default format
-- ("Player_17_Majors_Rays_Spring_2026_ABC") -- rewrite them to the new
-- "[TeamName] Player [UniformNumber]" format so search results (which read
-- player_tag directly for locked players, per playerRepository.ts's
-- searchPlayers) show the same identity the Roster/Leaderboard/Box Score
-- screens already compute live. Already-claimed players are untouched --
-- nothing about them changes here. A DO block (not a plain bulk UPDATE) is
-- needed because player_tag is unique and two different locked players CAN
-- collide on an identical computed tag (same team name reusing a uniform
-- number across different import batches) -- each collision gets a " (2)",
-- " (3)", ... suffix, mirroring findFreePlayerTag's disambiguation on the
-- TS side.
do $$
declare
  v_row record;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  for v_row in
    select distinct on (re.player_id)
      re.player_id,
      t.name as team_name,
      re.uniform_number
    from roster_entry re
    join team t on t.id = re.team_id
    join player p on p.id = re.player_id
    where re.player_id is not null and p.is_coach_fallback = true
    order by re.player_id, (t.season_status = 'in_season') desc, re.created_at desc
  loop
    v_base := v_row.team_name || ' Player ' || v_row.uniform_number::text;
    v_candidate := v_base;
    v_suffix := 1;
    while exists (select 1 from player where player_tag = v_candidate and id <> v_row.player_id) loop
      v_suffix := v_suffix + 1;
      v_candidate := v_base || ' (' || v_suffix::text || ')';
    end loop;

    update player set player_tag = v_candidate where id = v_row.player_id;
  end loop;
end;
$$;

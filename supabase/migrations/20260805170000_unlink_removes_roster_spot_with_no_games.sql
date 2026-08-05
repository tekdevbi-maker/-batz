-- Unlinking normally returns a player to locked status and keeps the
-- roster spot around so a parent can re-claim it later -- that's still
-- the right behavior once real games/stats exist for the spot. But if the
-- spot has zero batting-stat rows anywhere (no games have ever been
-- recorded for it), there's nothing for a parent to reclaim: leaving a
-- blank locked card cluttering the roster serves no purpose, so remove
-- the roster_entry entirely in that case. The player row itself is only
-- removed too if it has no OTHER roster_entry (i.e. no history on a
-- different team/season) -- a player with real career stats elsewhere
-- must never be deleted just because this particular team's spot is
-- empty.
create or replace function unlink_player(p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_current_parent uuid;
  v_current_team_id uuid;
  v_current_uniform int;
  v_current_team_name text;
  v_roster_entry_id uuid;
  v_head_coach uuid;
  v_has_stats boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select parent_user_id into v_current_parent from player where id = p_player_id;
  if v_current_parent is null then
    raise exception 'player_not_found';
  end if;

  select re.id, re.team_id, re.uniform_number, t.name
  into v_roster_entry_id, v_current_team_id, v_current_uniform, v_current_team_name
  from roster_entry re
  join team t on t.id = re.team_id
  where re.player_id = p_player_id
  order by (t.season_status = 'in_season') desc, re.created_at desc
  limit 1;

  if v_current_team_id is null then
    raise exception 'no_roster_entry_found';
  end if;

  if v_caller <> v_current_parent
     and not exists (
       select 1 from coach_assignment
       where team_id = v_current_team_id and user_id = v_caller and role = 'primary'
     )
  then
    raise exception 'not_authorized_to_unlink';
  end if;

  select ca.user_id into v_head_coach
  from coach_assignment ca
  where ca.team_id = v_current_team_id and ca.role = 'primary';

  if v_head_coach is null then
    raise exception 'no_head_coach_found';
  end if;

  select exists (select 1 from game_batting_stat where roster_entry_id = v_roster_entry_id) into v_has_stats;

  if not v_has_stats then
    delete from roster_entry where id = v_roster_entry_id;
    if not exists (select 1 from roster_entry where player_id = p_player_id) then
      delete from player where id = p_player_id;
    end if;
    return;
  end if;

  update player
  set parent_user_id = v_head_coach,
      is_coach_fallback = true,
      display_mode = 'uniform',
      parent_attested_at = null,
      parent_attested_by = null,
      newly_assigned = false,
      player_tag = v_current_team_name || ' Player ' || v_current_uniform::text
  where id = p_player_id;
end;
$$;

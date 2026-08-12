-- Unfollowing a team also unlinks any player the leaving Fan currently owns
-- ON THAT TEAM (real/attested ownership only -- a coach-fallback spot has
-- nothing to unlink). Mirrors unlink_player's own reassignment (hand the
-- player back to that team's Head Coach as coach-fallback, reset to the
-- default locked tag), but scoped to p_team_id specifically rather than
-- unlink_player's own "most relevant current team" lookup, since a parent
-- unfollowing Team A shouldn't touch a player they separately own on Team
-- B. Runs as one atomic RPC so the membership row and every affected
-- player update succeed or fail together. Returns the count of players
-- unlinked so the UI can tell the Fan what just happened.
create or replace function leave_team_and_unlink_players(p_team_id uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_name text;
  v_head_coach uuid;
  v_unlinked_count integer := 0;
  r record;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select name into v_team_name from team where id = p_team_id;
  if v_team_name is null then
    raise exception 'team_not_found';
  end if;

  select ca.user_id into v_head_coach
  from coach_assignment ca
  where ca.team_id = p_team_id and ca.role = 'primary';

  if v_head_coach is not null then
    for r in
      select p.id, re.uniform_number
      from player p
      join roster_entry re on re.player_id = p.id
      where re.team_id = p_team_id
        and p.parent_user_id = v_caller
        and coalesce(p.is_coach_fallback, false) = false
    loop
      update player
      set parent_user_id = v_head_coach,
          is_coach_fallback = true,
          display_mode = 'uniform',
          parent_attested_at = null,
          parent_attested_by = null,
          player_tag = v_team_name || ' Player ' || r.uniform_number::text
      where id = r.id;
      v_unlinked_count := v_unlinked_count + 1;
    end loop;
  end if;

  delete from team_membership where team_id = p_team_id and user_id = v_caller;

  return v_unlinked_count;
end;
$$;

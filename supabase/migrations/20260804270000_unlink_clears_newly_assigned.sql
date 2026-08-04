-- unlink_player wasn't clearing newly_assigned -- if the outgoing parent
-- never visited Home to acknowledge it (dismissing the "you were assigned
-- this player" banner), the flag stayed true on the player row. Once
-- unlinked, ownership reverts to the Head Coach, and that stale flag then
-- incorrectly showed the same "added to your account" banner to the
-- COACH, who's just reclaiming a player they already had, not receiving a
-- new one.
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
  v_head_coach uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select parent_user_id into v_current_parent from player where id = p_player_id;
  if v_current_parent is null then
    raise exception 'player_not_found';
  end if;

  select re.team_id, re.uniform_number, t.name
  into v_current_team_id, v_current_uniform, v_current_team_name
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

-- Self-service parent claim: with auto-claim-at-import now landing every
-- player on the Head Coach, a real parent needs a way to take ownership
-- without waiting on the coach to run Team Members -> Transfer. Only
-- ever allowed when the CURRENT owner is a coach on that team (never a
-- real parent) -- this is what stops one parent from hijacking another
-- parent's already-claimed player. "Coach can retrieve if claimed wrong"
-- is the existing Team Members -> Transfer flow, extended below so a
-- coach is a valid transfer target too.
create or replace function parent_claim_player(p_roster_entry_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_current_owner uuid;
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, re.player_id into v_team_id, v_player_id
  from roster_entry re
  where re.id = p_roster_entry_id;

  if v_team_id is null then
    raise exception 'roster_entry_not_found';
  end if;
  if v_player_id is null then
    raise exception 'roster_entry_not_claimed';
  end if;

  select parent_user_id into v_current_owner from player where id = v_player_id;

  if v_current_owner = v_caller then
    return;
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_current_owner) then
    raise exception 'already_claimed_by_a_parent';
  end if;

  select exists (select 1 from team_membership where team_id = v_team_id and user_id = v_caller)
    or exists (select 1 from coach_assignment where team_id = v_team_id and user_id = v_caller)
    into v_already_member;

  if not v_already_member and team_member_count(v_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  update player
  set parent_user_id = v_caller, parent_attested_at = null, parent_attested_by = null
  where id = v_player_id;

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;
end;
$$;

-- "Coach can retrieve": transfer_player_to_member's target had to already
-- be in team_membership specifically, which a coach who never followed
-- their own team's link won't have -- widen it to accept any team member,
-- coach or otherwise, same union get_team_members already uses.
create or replace function transfer_player_to_member(
  p_roster_entry_id uuid,
  p_target_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_target_is_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, re.player_id into v_team_id, v_player_id
  from roster_entry re
  where re.id = p_roster_entry_id;

  if v_team_id is null then
    raise exception 'roster_entry_not_found';
  end if;
  if v_player_id is null then
    raise exception 'roster_entry_not_claimed';
  end if;

  if not exists (select 1 from coach_assignment where team_id = v_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  select exists (select 1 from team_membership where team_id = v_team_id and user_id = p_target_user_id)
    or exists (select 1 from coach_assignment where team_id = v_team_id and user_id = p_target_user_id)
    into v_target_is_member;

  if not v_target_is_member then
    raise exception 'target_not_a_team_member';
  end if;

  update player
  set parent_user_id = p_target_user_id, parent_attested_at = null, parent_attested_by = null
  where id = v_player_id;
end;
$$;

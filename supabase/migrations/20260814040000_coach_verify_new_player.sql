-- Gap #1 (Email Plus groundwork): the coach-initiated "Verify" flow. A
-- coach recognizes which fan on their team is a specific player's
-- parent and creates the player + immediately offers it to that fan in
-- one action -- unlike CSV import, no locked/unmatched player record is
-- ever left sitting around, since it's created already tied to an
-- already-verified fan. Reuses the exact same offer/consent/onboarding
-- pipeline as "Transfer to Fan" (player_claim_request, initiated_by
-- 'coach') from that point on.
create or replace function coach_verify_new_player(
  p_team_id uuid,
  p_target_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_uniform_number int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_head_coach_id uuid;
  v_team_name text;
  v_target_is_member boolean;
  v_new_player_id uuid;
  v_new_roster_entry_id uuid;
  v_new_request_id uuid;
  v_candidate_tag text;
  v_suffix int := 0;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = p_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  select exists (select 1 from team_membership where team_id = p_team_id and user_id = p_target_user_id)
    or exists (select 1 from coach_assignment where team_id = p_team_id and user_id = p_target_user_id)
    into v_target_is_member;
  if not v_target_is_member then
    raise exception 'target_not_a_team_member';
  end if;

  select ca.user_id into v_head_coach_id
  from coach_assignment ca
  where ca.team_id = p_team_id and ca.role = 'primary';
  if v_head_coach_id is null then
    raise exception 'no_head_coach_found';
  end if;

  select name into v_team_name from team where id = p_team_id;

  -- Same "[TeamName] Player [UniformNumber]" locked-tag format as
  -- generateLockedPlayerTag (app/lib/playerTag.ts), with the same
  -- "0_1", "0_2", ... disambiguation on a collision.
  v_candidate_tag := v_team_name || ' Player ' || p_uniform_number::text;
  while exists (select 1 from player where player_tag = v_candidate_tag) loop
    v_suffix := v_suffix + 1;
    v_candidate_tag := v_team_name || ' Player 0_' || v_suffix::text;
  end loop;

  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach_id, nullif(p_first_name, ''), nullif(p_last_name, ''), v_candidate_tag, true)
  returning id into v_new_player_id;

  begin
    insert into roster_entry (team_id, uniform_number, first_name, last_name, player_id)
    values (p_team_id, p_uniform_number, nullif(p_first_name, ''), nullif(p_last_name, ''), v_new_player_id)
    returning id into v_new_roster_entry_id;
  exception when unique_violation then
    raise exception 'uniform_number_taken';
  end;

  insert into player_claim_request (roster_entry_id, player_id, requested_by, initiated_by, offered_by)
  values (v_new_roster_entry_id, v_new_player_id, p_target_user_id, 'coach', v_caller)
  returning id into v_new_request_id;

  return v_new_request_id;
end;
$$;

-- drop the temporary debug_inspect_player RPC used to diagnose the "I'm
-- the Parent" button reappearing on an already-claimed player.
drop function if exists debug_inspect_player(text);

-- request_player_claim's eligibility check used "is the current owner a
-- coach on this team" as a proxy for "still locked/unclaimed" -- wrong
-- whenever the real claiming parent also happens to coach that team (an
-- assistant coach whose own kid plays for them), since that proxy stays
-- true forever after a legitimate claim. is_coach_fallback is the
-- authoritative flag; check that directly instead. Same fix as the
-- client-side isOwnedByCoach removal in playerRepository.ts.
create or replace function request_player_claim(p_roster_entry_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_current_owner uuid;
  v_is_coach_fallback boolean;
  v_existing_request_id uuid;
  v_new_request_id uuid;
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

  select parent_user_id, is_coach_fallback into v_current_owner, v_is_coach_fallback
  from player where id = v_player_id;

  if v_current_owner = v_caller then
    return null;
  end if;

  if not v_is_coach_fallback then
    raise exception 'already_claimed_by_a_parent';
  end if;

  select id into v_existing_request_id
  from player_claim_request
  where roster_entry_id = p_roster_entry_id and requested_by = v_caller and status = 'pending';

  if v_existing_request_id is not null then
    return v_existing_request_id;
  end if;

  insert into player_claim_request (roster_entry_id, player_id, requested_by)
  values (p_roster_entry_id, v_player_id, v_caller)
  returning id into v_new_request_id;

  return v_new_request_id;
end;
$$;

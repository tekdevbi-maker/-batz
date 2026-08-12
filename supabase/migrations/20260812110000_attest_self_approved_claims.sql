-- Bug: a coach who approves/accepts a claim or transfer offer for THEMSELVES
-- (e.g. an assistant coach claiming their own kid) unlocks the player but
-- Settings then vanishes from the Player Profile screen. The gate on
-- Settings (app/app/player/[playerId]/index.tsx) hides it for a coach-owner
-- unless parent_attested_at is set, but both approve_player_claim_request
-- and respond_to_transfer_offer unconditionally null it out -- only the
-- separate "Unlock this Player" attest_player_parent RPC ever set it. When
-- the approving/accepting caller IS the new owner, that consent step is
-- redundant (they just performed the equivalent action themselves), so
-- attest them automatically instead of leaving parent_attested_at null.

create or replace function approve_player_claim_request(p_request_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_roster_entry_id uuid;
  v_requested_by uuid;
  v_status text;
  v_initiated_by text;
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select r.roster_entry_id, r.player_id, r.requested_by, r.status, r.initiated_by, re.team_id
  into v_roster_entry_id, v_player_id, v_requested_by, v_status, v_initiated_by, v_team_id
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.id = p_request_id;

  if v_team_id is null then
    raise exception 'request_not_found';
  end if;
  if v_initiated_by <> 'parent' then
    raise exception 'not_a_claim_request';
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  if v_status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  select exists (select 1 from team_membership where team_id = v_team_id and user_id = v_requested_by)
    or exists (select 1 from coach_assignment where team_id = v_team_id and user_id = v_requested_by)
    into v_already_member;

  if not v_already_member and team_member_count(v_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  update player
  set parent_user_id = v_requested_by,
      parent_attested_at = case when v_caller = v_requested_by then now() else null end,
      parent_attested_by = case when v_caller = v_requested_by then v_caller else null end,
      is_coach_fallback = false,
      newly_assigned = true
  where id = v_player_id;

  perform merge_player_into_existing(v_requested_by, v_player_id);

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_requested_by)
  on conflict (team_id, user_id) do nothing;

  update player_claim_request
  set status = 'approved', decided_by = v_caller, decided_at = now()
  where id = p_request_id;

  update player_claim_request
  set status = 'denied', decided_by = v_caller, decided_at = now()
  where roster_entry_id = v_roster_entry_id and status = 'pending' and id <> p_request_id;
end;
$$;

-- respond_to_transfer_offer already requires v_requested_by = v_caller (the
-- named target is the only one who can agree), so the new owner is always
-- the one accepting -- attest unconditionally.
create or replace function respond_to_transfer_offer(p_request_id uuid, p_agree boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_roster_entry_id uuid;
  v_requested_by uuid;
  v_status text;
  v_initiated_by text;
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select r.roster_entry_id, r.player_id, r.requested_by, r.status, r.initiated_by, re.team_id
  into v_roster_entry_id, v_player_id, v_requested_by, v_status, v_initiated_by, v_team_id
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.id = p_request_id;

  if v_team_id is null then
    raise exception 'request_not_found';
  end if;
  if v_initiated_by <> 'coach' then
    raise exception 'not_a_transfer_offer';
  end if;
  if v_requested_by <> v_caller then
    raise exception 'not_the_offer_target';
  end if;
  if v_status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  if not p_agree then
    update player_claim_request
    set status = 'denied', decided_by = v_caller, decided_at = now()
    where id = p_request_id;
    return;
  end if;

  select exists (select 1 from team_membership where team_id = v_team_id and user_id = v_requested_by)
    or exists (select 1 from coach_assignment where team_id = v_team_id and user_id = v_requested_by)
    into v_already_member;

  if not v_already_member and team_member_count(v_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  update player
  set parent_user_id = v_requested_by,
      parent_attested_at = now(),
      parent_attested_by = v_caller,
      is_coach_fallback = false,
      newly_assigned = true
  where id = v_player_id;

  perform merge_player_into_existing(v_requested_by, v_player_id);

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_requested_by)
  on conflict (team_id, user_id) do nothing;

  update player_claim_request
  set status = 'approved', decided_by = v_caller, decided_at = now()
  where id = p_request_id;

  update player_claim_request
  set status = 'denied', decided_by = v_caller, decided_at = now()
  where roster_entry_id = v_roster_entry_id and status = 'pending' and id <> p_request_id;
end;
$$;

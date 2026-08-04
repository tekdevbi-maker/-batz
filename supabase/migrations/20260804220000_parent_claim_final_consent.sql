-- A coach approving a parent-initiated claim request used to transfer
-- ownership immediately -- but per the latest design, that's really just
-- the COACH's half of the decision; the parent still needs to give the
-- exact same final consent a coach-initiated offer already requires
-- before anything actually changes. This makes both paths converge on one
-- real unlock step: the requesting parent's own Agree.
--
-- New status 'coach_approved' sits between 'pending' and 'approved' for a
-- parent-initiated (initiated_by = 'parent') row: the coach has signed
-- off, but the requesting parent hasn't yet. respond_to_transfer_offer
-- (already the parent's final-consent step for a coach-initiated offer)
-- is broadened to also finalize a coach-approved parent-initiated request
-- the same way -- one shared "did the target actually agree" gate for
-- both directions.

alter table player_claim_request drop constraint player_claim_request_status_check;
alter table player_claim_request
  add constraint player_claim_request_status_check
  check (status in ('pending', 'coach_approved', 'approved', 'denied'));

-- approve_player_claim_request no longer transfers ownership -- it only
-- records the coach's sign-off. The requesting parent still has to agree
-- via respond_to_transfer_offer before the player actually unlocks.
create or replace function approve_player_claim_request(p_request_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_requested_by uuid;
  v_status text;
  v_initiated_by text;
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select r.requested_by, r.status, r.initiated_by, re.team_id
  into v_requested_by, v_status, v_initiated_by, v_team_id
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

  update player_claim_request
  set status = 'coach_approved', decided_by = v_caller, decided_at = now()
  where id = p_request_id;
end;
$$;

-- respond_to_transfer_offer: broadened to cover BOTH the target's final
-- consent on a coach-initiated offer (initiated_by = 'coach', status =
-- 'pending') AND a requesting parent's final consent after coach sign-off
-- (initiated_by = 'parent', status = 'coach_approved'). Either way, this
-- is the one place ownership actually changes.
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
  if v_requested_by <> v_caller then
    raise exception 'not_the_offer_target';
  end if;

  if v_initiated_by = 'coach' then
    if v_status <> 'pending' then
      raise exception 'request_not_pending';
    end if;
  elsif v_initiated_by = 'parent' then
    if v_status <> 'coach_approved' then
      raise exception 'request_not_pending';
    end if;
  else
    raise exception 'not_a_transfer_offer';
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
      parent_attested_at = null,
      parent_attested_by = null,
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
  where roster_entry_id = v_roster_entry_id and status in ('pending', 'coach_approved') and id <> p_request_id;
end;
$$;

-- list_my_pending_transfer_offers: now surfaces BOTH a coach-initiated
-- offer awaiting my consent AND my own parent-initiated request the coach
-- has already approved and is awaiting my final consent -- same shared
-- popup, same notification banner, either way. The "offering/approving
-- coach" is offered_by for a coach-initiated row, or decided_by (whoever
-- approved it) for a coach-approved parent-initiated row.
drop function if exists list_my_pending_transfer_offers();
create or replace function list_my_pending_transfer_offers()
returns table (
  request_id uuid,
  player_id uuid,
  display_name text,
  team_name text,
  player_first_name text,
  player_last_name text,
  coach_first_name text,
  coach_last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.player_id, p.player_tag, t.name,
    p.first_name, p.last_name,
    ca.first_name, ca.last_name
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join team t on t.id = re.team_id
  join player p on p.id = r.player_id
  left join coach_assignment ca
    on ca.team_id = re.team_id
   and ca.user_id = case when r.initiated_by = 'coach' then r.offered_by else r.decided_by end
  where r.requested_by = auth.uid()
    and (
      (r.initiated_by = 'coach' and r.status = 'pending')
      or (r.initiated_by = 'parent' and r.status = 'coach_approved')
    );
$$;

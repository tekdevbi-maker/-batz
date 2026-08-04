-- Phase 3 of the locked-player/COPPA rework (2026-08-04 plan): both ways a
-- player gets unlocked now go through the SAME explicit parental-consent
-- step, not an instant transfer -- a coach can no longer directly hand a
-- player to a Follower with transfer_player_to_member; they can only OFFER
-- it, and the target Follower has to agree before ownership actually
-- changes. request_player_claim (Follower-initiated) already worked this
-- way; this adds the coach-initiated mirror image and a matching unlink.

alter table player_claim_request
  add column initiated_by text not null default 'parent' check (initiated_by in ('parent', 'coach'));

-- transfer_player_to_member is retired -- offer_player_transfer +
-- respond_to_transfer_offer replace it. Nothing else referenced this
-- function (checked: only the old instant "Transfer to Parent" pick-a-member
-- step in members.tsx, which now calls offer_player_transfer instead).
drop function if exists transfer_player_to_member(uuid, uuid);

-- Coach-initiated offer: mirrors request_player_claim's shape but the
-- requesting/deciding roles are reversed -- the COACH names the target
-- Follower, and the FOLLOWER (requested_by) is who ultimately agrees or
-- declines via respond_to_transfer_offer. Re-offering while a prior offer
-- to the same target is still pending returns that same request.
create or replace function offer_player_transfer(p_roster_entry_id uuid, p_target_user_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_target_is_member boolean;
  v_target_is_coach boolean;
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

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  select exists (select 1 from team_membership where team_id = v_team_id and user_id = p_target_user_id)
    into v_target_is_member;
  select exists (select 1 from coach_assignment where team_id = v_team_id and user_id = p_target_user_id)
    into v_target_is_coach;

  if not v_target_is_member and not v_target_is_coach then
    raise exception 'target_not_a_team_member';
  end if;

  select id into v_existing_request_id
  from player_claim_request
  where roster_entry_id = p_roster_entry_id
    and requested_by = p_target_user_id
    and initiated_by = 'coach'
    and status = 'pending';

  if v_existing_request_id is not null then
    return v_existing_request_id;
  end if;

  insert into player_claim_request (roster_entry_id, player_id, requested_by, initiated_by)
  values (p_roster_entry_id, v_player_id, p_target_user_id, 'coach')
  returning id into v_new_request_id;

  return v_new_request_id;
end;
$$;

-- Follower's response to a coach-initiated offer -- the one place a
-- coach-offered transfer actually changes ownership, and only the named
-- target (requested_by) can call it. Agreeing runs the identical
-- update+merge+team_membership+newly_assigned steps
-- approve_player_claim_request uses for the parent-initiated path, so both
-- roads to "unlocked" behave the same way from here on.
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
  where roster_entry_id = v_roster_entry_id and status = 'pending' and id <> p_request_id;
end;
$$;

-- Follower-facing: my own pending coach-initiated offers, across every
-- team -- drives the consent popup surfaced from a Home notification
-- (Phase 4) as well as directly on the player's own card.
create or replace function list_my_pending_transfer_offers()
returns table (request_id uuid, player_id uuid, display_name text, team_name text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.player_id, p.player_tag, t.name
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join team t on t.id = re.team_id
  join player p on p.id = r.player_id
  where r.requested_by = auth.uid() and r.initiated_by = 'coach' and r.status = 'pending';
$$;

-- list_pending_claim_requests_for_team's approval queue is coach-decided,
-- so it only ever showed initiated_by = 'parent' requests to begin with --
-- restrict it explicitly now that coach-initiated rows exist in the same
-- table, so a coach-offered transfer (which only the TARGET can decide)
-- never shows up there as something to approve/deny.
create or replace function list_pending_claim_requests_for_team(p_team_id uuid)
returns table (
  request_id uuid,
  roster_entry_id uuid,
  player_id uuid,
  uniform_number int,
  player_name text,
  requested_by uuid,
  requester_email text,
  requester_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  return query
  select
    r.id,
    r.roster_entry_id,
    r.player_id,
    re.uniform_number,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '#' || re.uniform_number::text),
    r.requested_by,
    u.email::text,
    coalesce(nullif(trim(coalesce(tm.first_name, '') || ' ' || coalesce(tm.last_name, '')), ''), u.email::text),
    r.created_at
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join auth.users u on u.id = r.requested_by
  left join player p on p.id = r.player_id
  left join team_membership tm on tm.team_id = re.team_id and tm.user_id = r.requested_by
  where re.team_id = p_team_id and r.status = 'pending' and r.initiated_by = 'parent'
  order by r.created_at;
end;
$$;

-- approve/deny stay coach-only decisions on parent-initiated requests --
-- guard against a coach ever approving/denying a coach-initiated offer
-- that's actually the target's call via respond_to_transfer_offer.
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
  where roster_entry_id = v_roster_entry_id and status = 'pending' and id <> p_request_id;
end;
$$;

create or replace function deny_player_claim_request(p_request_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_status text;
  v_initiated_by text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, r.status, r.initiated_by into v_team_id, v_status, v_initiated_by
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

  update player_claim_request
  set status = 'denied', decided_by = v_caller, decided_at = now()
  where id = p_request_id;
end;
$$;

-- Unlink: reverts a claimed player back to locked/coach-fallback under the
-- Head Coach of their CURRENT team (same "current" pick as
-- reassign_players_to_foster_parent -- in_season first, else most recent).
-- Callable by two people: the player's own current parent (self-service,
-- offered right in the same consent popup that unlocked them) or that
-- team's Head Coach (unilateral). player_tag is reset to the locked
-- default so a search result -- which reads player_tag directly for locked
-- players -- doesn't keep showing whatever alias the outgoing parent had
-- set.
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
      player_tag = v_current_team_name || ' Player ' || v_current_uniform::text
  where id = p_player_id;
end;
$$;

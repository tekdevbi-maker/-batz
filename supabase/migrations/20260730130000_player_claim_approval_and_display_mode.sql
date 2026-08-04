-- Rethink of import-time name locking + parent claim flow (2026-07-30
-- design discussion): an unclaimed (coach-fallback) roster spot must
-- always render as "#N" no matter what, a parent's own per-player display
-- choice (uniform / alias / real name) wins once they're claimed, and a
-- parent's self-claim now requires the team's coach to approve before
-- ownership actually transfers. Replaces the boolean reveal_full_name
-- with a 3-way display_mode, adds a leaderboard opt-out, and retires the
-- team-wide player_display_mode (Team Settings toggle) since it no longer
-- has anything left to govern: unclaimed is always forced to uniform, and
-- claimed always follows the parent's own per-player choice.

alter table player
  add column display_mode text not null default 'uniform' check (display_mode in ('uniform', 'tag', 'real_name')),
  add column leaderboard_opt_out boolean not null default false;

update player set display_mode = case when reveal_full_name then 'real_name' else 'uniform' end;

alter table player drop column reveal_full_name;

alter table team drop column if exists player_display_mode;

-- Pending parent self-claim requests, awaiting the team's coach to approve
-- or deny. Coach-initiated paths (direct roster transfer via
-- transfer_player_to_member, invite-link claim) are unaffected -- the
-- coach initiating those IS the approval, so they stay immediate.
create table player_claim_request (
  id uuid primary key default gen_random_uuid(),
  roster_entry_id uuid not null references roster_entry (id) on delete cascade,
  player_id uuid not null references player (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz
);

alter table player_claim_request enable row level security;
-- No client policies -- same pattern as player_transfer_invite: every
-- read/write goes through a SECURITY DEFINER RPC below, each doing its
-- own authorization check (requester or team coach only).

-- auto_claim_roster_entry: drop the old reveal_full_name=true default --
-- fallback players now rely on display_mode's own 'uniform' default, and
-- is_coach_fallback (already set true here) is what displayNameFor checks
-- to force uniform display regardless of any later display_mode value, so
-- a coach can't accidentally reveal a real name pre-claim.
create or replace function auto_claim_roster_entry(
  p_roster_entry_id uuid,
  p_first_name text,
  p_last_name text,
  p_player_tag text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_existing_player_id uuid;
  v_head_coach_id uuid;
  v_new_player_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, re.player_id into v_team_id, v_existing_player_id
  from roster_entry re
  where re.id = p_roster_entry_id;

  if v_team_id is null then
    raise exception 'roster_entry_not_found';
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  if v_existing_player_id is not null then
    return v_existing_player_id;
  end if;

  select ca.user_id into v_head_coach_id
  from coach_assignment ca
  where ca.team_id = v_team_id and ca.role = 'primary';

  if v_head_coach_id is null then
    raise exception 'no_head_coach_found';
  end if;

  insert into player (parent_user_id, first_name, last_name, player_tag, is_coach_fallback)
  values (v_head_coach_id, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag, true)
  returning id into v_new_player_id;

  update roster_entry
  set player_id = v_new_player_id
  where id = p_roster_entry_id and player_id is null;

  return v_new_player_id;
end;
$$;

-- reassign_players_to_foster_parent: reveal_full_name=false -> display_mode='uniform'.
create or replace function reassign_players_to_foster_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_head_coach uuid;
begin
  for v_player in select id from player where parent_user_id = old.id loop
    select ca.user_id into v_head_coach
    from roster_entry re
    join team t on t.id = re.team_id
    join coach_assignment ca on ca.team_id = t.id and ca.role = 'primary'
    where re.player_id = v_player.id
    order by (t.season_status = 'in_season') desc, re.created_at desc
    limit 1;

    if v_head_coach is not null then
      update player
      set parent_user_id = v_head_coach,
          display_mode = 'uniform',
          parent_attested_at = null,
          parent_attested_by = null,
          is_coach_fallback = true
      where id = v_player.id;
    end if;
  end loop;

  return old;
end;
$$;

-- parent_claim_player is replaced by a two-step request/approve flow.
drop function if exists parent_claim_player(uuid);

-- Step 1: parent requests a claim. Same eligibility check the old
-- immediate parent_claim_player had (current owner must still be a coach
-- on the team, i.e. an unclaimed fallback spot) -- but this only records
-- the request; ownership doesn't change until a coach approves it.
-- Re-requesting while a prior request is still pending returns that same
-- request instead of creating a duplicate.
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

  select parent_user_id into v_current_owner from player where id = v_player_id;

  if v_current_owner = v_caller then
    return null;
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_current_owner) then
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

-- Step 2a: coach approves -- this is where ownership actually transfers,
-- reusing the same update + merge + team_membership steps the old
-- immediate parent_claim_player did.
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
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select r.roster_entry_id, r.player_id, r.requested_by, r.status, re.team_id
  into v_roster_entry_id, v_player_id, v_requested_by, v_status, v_team_id
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.id = p_request_id;

  if v_team_id is null then
    raise exception 'request_not_found';
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
      is_coach_fallback = false
  where id = v_player_id;

  perform merge_player_into_existing(v_requested_by, v_player_id);

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_requested_by)
  on conflict (team_id, user_id) do nothing;

  update player_claim_request
  set status = 'approved', decided_by = v_caller, decided_at = now()
  where id = p_request_id;

  -- Any other still-pending request for the same spot no longer applies.
  update player_claim_request
  set status = 'denied', decided_by = v_caller, decided_at = now()
  where roster_entry_id = v_roster_entry_id and status = 'pending' and id <> p_request_id;
end;
$$;

-- Step 2b: coach denies -- request just closes out, no ownership change.
create or replace function deny_player_claim_request(p_request_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_status text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, r.status into v_team_id, v_status
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.id = p_request_id;

  if v_team_id is null then
    raise exception 'request_not_found';
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

-- Coach-facing list for the Team Members screen's approval queue.
create or replace function list_pending_claim_requests_for_team(p_team_id uuid)
returns table (
  request_id uuid,
  roster_entry_id uuid,
  player_id uuid,
  uniform_number int,
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
    r.requested_by,
    u.email::text,
    coalesce(nullif(trim(coalesce(tm.first_name, '') || ' ' || coalesce(tm.last_name, '')), ''), u.email::text),
    r.created_at
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join auth.users u on u.id = r.requested_by
  left join team_membership tm on tm.team_id = re.team_id and tm.user_id = r.requested_by
  where re.team_id = p_team_id and r.status = 'pending'
  order by r.created_at;
end;
$$;

-- Parent-facing: is there already a pending request from me for this
-- roster entry? Drives the Player Profile's claim-button state.
create or replace function get_my_claim_request_status(p_roster_entry_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_status text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select status into v_status
  from player_claim_request
  where roster_entry_id = p_roster_entry_id and requested_by = v_caller
  order by created_at desc
  limit 1;

  return v_status;
end;
$$;

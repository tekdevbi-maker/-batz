-- In-app "you got a new player" notification: there's no push/email
-- notification system in this app at all, so a parent currently has no
-- way to know a coach transferred a player to them, or that their claim
-- request was approved, except stumbling onto it. This adds a simple
-- unread flag set at the moment ownership actually changes to a real
-- (non-coach) parent, cleared once they've seen it on Home.

alter table player add column if not exists newly_assigned boolean not null default false;

-- approve_player_claim_request: flag the player as newly assigned to the
-- requesting parent.
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

-- transfer_player_to_member: flag the player as newly assigned, but only
-- when the target is an actual parent, not a fellow coach picking up
-- fallback ownership (they already know -- they're the one clicking it,
-- and it's not really "their kid" in the notification-worthy sense).
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
  v_target_is_coach boolean;
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
    into v_target_is_member;
  select exists (select 1 from coach_assignment where team_id = v_team_id and user_id = p_target_user_id)
    into v_target_is_coach;

  if not v_target_is_member and not v_target_is_coach then
    raise exception 'target_not_a_team_member';
  end if;

  update player
  set parent_user_id = p_target_user_id,
      parent_attested_at = null,
      parent_attested_by = null,
      is_coach_fallback = v_target_is_coach,
      newly_assigned = case when v_target_is_coach then newly_assigned else true end
  where id = v_player_id;

  if not v_target_is_coach then
    perform merge_player_into_existing(p_target_user_id, v_player_id);
  end if;
end;
$$;

-- Home-facing: players newly assigned to me that I haven't seen yet.
create or replace function list_newly_assigned_players()
returns table (player_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), player_tag)
  from player
  where parent_user_id = auth.uid() and newly_assigned = true;
$$;

-- Clears the flag once Home has shown the banner and the user dismissed it.
create or replace function acknowledge_new_players() returns void
language sql
security definer
set search_path = public
as $$
  update player set newly_assigned = false where parent_user_id = auth.uid() and newly_assigned = true;
$$;

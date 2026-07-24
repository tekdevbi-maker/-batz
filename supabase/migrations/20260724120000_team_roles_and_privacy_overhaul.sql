-- Sprint 11: team roles/privacy overhaul (see planning summary).
--
-- One join link per team, capped at 100 total members across every role
-- (Head Coach + up to 3 Assistant Coaches + Parents + Followers). Adds a
-- Follower role (view-only, no player claim), replaces the token-based
-- player transfer with a direct coach -> member reassignment, replaces
-- self-serve assistant-coach joining with coach-initiated promotion from
-- the member list, adds a per-team player-display-mode setting, adds
-- parent-attestation for coach-claimed players, and re-scopes Private
-- player visibility to be team-only (Roster is the sole entry point) --
-- superseding the Sprint 6 division-wide model.

alter table team
  add column player_display_mode text not null default 'all'
    check (player_display_mode in ('uniform_only', 'initials', 'all'));

alter table player
  add column parent_attested_at timestamptz,
  add column parent_attested_by uuid references auth.users (id);

-- New players default to Private regardless of claim path (generalizes
-- the earlier "coach-auto-claimed players default Private" instruction --
-- the user later extended this to every new player).
alter table player alter column visibility_scope set default 'private';

-- Total-member-count helper: 1 head coach + up to 3 assistants (both in
-- coach_assignment) + parents/followers (team_membership). A claimed
-- parent always has a team_membership row (register_player already
-- inserts one), so counting the union avoids double-counting a coach who
-- also claimed a player.
create or replace function team_member_count(p_team_id uuid) returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from (
    select user_id from coach_assignment where team_id = p_team_id
    union
    select user_id from team_membership where team_id = p_team_id
  ) members;
$$;

-- Follower join: adds team_membership only, no player claim. Same
-- 100-member cap as claiming. Idempotent (re-joining is a no-op, not an
-- error) since a Follower may later also claim a player via
-- register_player, which inserts team_membership itself anyway.
create or replace function join_team_as_follower(p_team_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from team_membership where team_id = p_team_id and user_id = v_caller)
    or exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    return;
  end if;

  if team_member_count(p_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  insert into team_membership (team_id, user_id) values (p_team_id, v_caller);
end;
$$;

-- register_player now also enforces the 100-member cap (a brand-new
-- member claiming straight to Parent, skipping the Follower step, still
-- counts against the same cap) and defaults new players to Private
-- explicitly (belt-and-suspenders with the column default above).
create or replace function register_player(
  p_team_id uuid,
  p_uniform_number int,
  p_first_name text,
  p_last_name text,
  p_player_tag text
) returns table (player_id uuid, roster_entry_id uuid, claimed_existing boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_player_id uuid;
  v_roster_entry_id uuid;
  v_existing_id uuid;
  v_existing_claimed boolean;
  v_claimed boolean := false;
  v_already_member boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.id, (re.player_id is not null) into v_existing_id, v_existing_claimed
  from roster_entry re
  where re.team_id = p_team_id and re.uniform_number = p_uniform_number
  limit 1;

  if v_existing_id is not null and v_existing_claimed then
    raise exception 'roster_spot_already_claimed';
  end if;

  select exists (select 1 from team_membership where team_id = p_team_id and user_id = v_caller)
    or exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller)
    into v_already_member;

  if not v_already_member and team_member_count(p_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  insert into player (parent_user_id, first_name, last_name, player_tag, visibility_scope)
  values (v_caller, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag, 'private')
  returning id into v_player_id;

  if v_existing_id is not null then
    update roster_entry
    set player_id = v_player_id
    where roster_entry.id = v_existing_id and roster_entry.player_id is null
    returning roster_entry.id into v_roster_entry_id;

    if v_roster_entry_id is null then
      raise exception 'roster_spot_already_claimed';
    end if;
    v_claimed := true;
  else
    insert into roster_entry (team_id, player_id, uniform_number, first_name, last_name)
    values (p_team_id, v_player_id, p_uniform_number, nullif(p_first_name, ''), nullif(p_last_name, ''))
    returning roster_entry.id into v_roster_entry_id;
  end if;

  insert into team_membership (team_id, user_id)
  values (p_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;

  return query select v_player_id, v_roster_entry_id, v_claimed;
end;
$$;

-- Coach-initiated promotion, replacing self-serve join_as_assistant_coach.
-- Target must already be a team member (joined via the link, as a
-- Follower or a Parent) -- promotion never creates membership itself.
create or replace function promote_to_assistant_coach(
  p_team_id uuid,
  p_target_user_id uuid,
  p_first_name text,
  p_last_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_count int;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  if not exists (
    select 1 from team_membership where team_id = p_team_id and user_id = p_target_user_id
  ) then
    raise exception 'target_not_a_team_member';
  end if;

  if exists (select 1 from coach_assignment where team_id = p_team_id and user_id = p_target_user_id) then
    raise exception 'already_a_coach_on_this_team';
  end if;

  select count(*) into v_count from coach_assignment where team_id = p_team_id and role = 'assistant';
  if v_count >= 3 then
    raise exception 'assistant_coach_capacity_reached';
  end if;

  insert into coach_assignment (team_id, user_id, role, first_name, last_name)
  values (p_team_id, p_target_user_id, 'assistant', nullif(p_first_name, ''), nullif(p_last_name, ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- Direct transfer to an existing team member -- no token, no link.
-- Replaces create_player_transfer/get_player_transfer_info/claim_player_transfer.
-- Clears any prior parent attestation: the new owner hasn't attested, and
-- a stale attestation under the OLD owner's account must not silently
-- carry forward.
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

  if not exists (select 1 from team_membership where team_id = v_team_id and user_id = p_target_user_id) then
    raise exception 'target_not_a_team_member';
  end if;

  update player
  set parent_user_id = p_target_user_id, parent_attested_at = null, parent_attested_by = null
  where id = v_player_id;
end;
$$;

-- "I am the parent for this player": a coach who currently owns the
-- player (parent_user_id = caller AND caller is a coach on that team)
-- logs a timestamped, attributable attestation, unlocking full
-- parent-level Settings access for that specific player without
-- reassigning parent_user_id.
create or replace function attest_player_parent(p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from player where id = p_player_id and parent_user_id = v_caller) then
    raise exception 'not_the_current_owner';
  end if;

  update player
  set parent_attested_at = now(), parent_attested_by = v_caller
  where id = p_player_id;
end;
$$;

-- Privacy redefinition (spec: Leaderboards show the row but the name
-- isn't a link, Search excludes Private players entirely, Roster is the
-- sole entry point) -- Private now means "viewer has team_membership or
-- coach_assignment on a team the player is rostered on," full stop. The
-- old division-wide carve-out is gone; a Private player's own team is the
-- only door in.
create or replace function can_view_player(target_player_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    target_player_id is null
    or exists (
      select 1 from player p
      where p.id = target_player_id
        and (p.visibility_scope = 'public' or p.parent_user_id = auth.uid())
    )
    or exists (
      select 1
      from roster_entry re
      where re.player_id = target_player_id
        and (
          exists (select 1 from coach_assignment ca where ca.team_id = re.team_id and ca.user_id = auth.uid())
          or exists (select 1 from team_membership tm where tm.team_id = re.team_id and tm.user_id = auth.uid())
        )
    );
$$;

-- Old token-based transfer mechanism is fully replaced by
-- transfer_player_to_member above -- drop it and its now-unused table.
drop function if exists claim_player_transfer(text);
drop function if exists get_player_transfer_info(text);
drop function if exists create_player_transfer(uuid);
drop table if exists player_transfer_invite;

-- Old self-serve assistant join is fully replaced by
-- promote_to_assistant_coach above.
drop function if exists join_as_assistant_coach(uuid, text, text);

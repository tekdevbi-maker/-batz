-- Prevent the Zane Ago situation going forward: a real parent ending up
-- with two separate `player` rows for the same kid because
-- matchOrCreateRosterEntries only ever matches a name against ITS OWN
-- team's roster, never across teams/seasons -- so a second team import
-- (or a fresh /join registration) created a brand-new player instead of
-- reusing the parent's existing one.
--
-- Scoped deliberately narrow: only ever dedupes within ONE parent's own
-- players, by exact (case-insensitive, trimmed) name match, and only at
-- the moment a REAL parent takes ownership -- register_player,
-- parent_claim_player, and a transfer_player_to_member landing on a
-- non-coach member. Never applied to auto_claim_roster_entry's coach
-- fallback ownership: a coach can legitimately hold two different real
-- kids who happen to share a name across different teams they coach, and
-- merging those would be a real, hard-to-undo data-loss bug -- far worse
-- than the duplicate-profile annoyance this is fixing. By the time a real
-- parent claims one of those spots, this function is what catches it.
create or replace function merge_player_into_existing(p_user_id uuid, p_player_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last text;
  v_existing_id uuid;
begin
  select first_name, last_name into v_first, v_last from player where id = p_player_id;

  if v_first is null or v_last is null or trim(v_first) = '' or trim(v_last) = '' then
    return p_player_id;
  end if;

  select id into v_existing_id
  from player
  where parent_user_id = p_user_id
    and id <> p_player_id
    and lower(trim(coalesce(first_name, ''))) = lower(trim(v_first))
    and lower(trim(coalesce(last_name, ''))) = lower(trim(v_last))
  order by created_at asc
  limit 1;

  if v_existing_id is null then
    return p_player_id;
  end if;

  update roster_entry set player_id = v_existing_id where player_id = p_player_id;
  update activity_feed_item set player_id = v_existing_id where player_id = p_player_id;

  insert into follow (follower_user_id, player_id)
  select follower_user_id, v_existing_id from follow where player_id = p_player_id
  on conflict (follower_user_id, player_id) do nothing;
  delete from follow where player_id = p_player_id;

  delete from player where id = p_player_id;

  return v_existing_id;
end;
$$;

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
  v_dupe_player_id uuid;
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

  -- Reuse an existing player of this same parent's with a matching name
  -- (e.g. a sibling season / second team) instead of minting a duplicate.
  if nullif(p_first_name, '') is not null and nullif(p_last_name, '') is not null then
    select id into v_dupe_player_id
    from player
    where parent_user_id = v_caller
      and lower(trim(coalesce(first_name, ''))) = lower(trim(p_first_name))
      and lower(trim(coalesce(last_name, ''))) = lower(trim(p_last_name))
    order by created_at asc
    limit 1;
  end if;

  if v_dupe_player_id is not null then
    v_player_id := v_dupe_player_id;
  else
    insert into player (parent_user_id, first_name, last_name, player_tag, visibility_scope)
    values (v_caller, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag, 'private')
    returning id into v_player_id;
  end if;

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
  set parent_user_id = v_caller, parent_attested_at = null, parent_attested_by = null, is_coach_fallback = false
  where id = v_player_id;

  perform merge_player_into_existing(v_caller, v_player_id);

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;
end;
$$;

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
      is_coach_fallback = v_target_is_coach
  where id = v_player_id;

  if not v_target_is_coach then
    perform merge_player_into_existing(p_target_user_id, v_player_id);
  end if;
end;
$$;

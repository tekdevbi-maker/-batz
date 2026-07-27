-- Distinguish a coach's own claimed players from roster spots they merely
-- hold as fallback owner ("Foster Parent" internally -- see
-- reassign_players_to_foster_parent / auto_claim_roster_entry). Both cases
-- set player.parent_user_id to the coach, so without a marker there's no
-- way to tell them apart. This flag is that marker: true only while the
-- coach is the fallback/placeholder owner, false the moment a real parent
-- (including the coach claiming their own kid via "I'm the Parent") takes
-- over.
alter table player add column if not exists is_coach_fallback boolean not null default false;

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

  insert into player (parent_user_id, first_name, last_name, player_tag, reveal_full_name, is_coach_fallback)
  values (v_head_coach_id, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag, true, true)
  returning id into v_new_player_id;

  update roster_entry
  set player_id = v_new_player_id
  where id = p_roster_entry_id and player_id is null;

  return v_new_player_id;
end;
$$;

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
          reveal_full_name = false,
          parent_attested_at = null,
          parent_attested_by = null,
          is_coach_fallback = true
      where id = v_player.id;
    end if;
  end loop;

  return old;
end;
$$;

-- A real claim -- by a parent, or a coach claiming their own kid --
-- always clears the fallback flag, same as it clears attestation.
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

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;
end;
$$;

-- Transfer target can be a coach (the "coach retrieves a wrongly-claimed
-- player" path) or a real member -- the fallback flag has to follow
-- whichever kind of owner it's landing on, not just clear unconditionally.
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
end;
$$;

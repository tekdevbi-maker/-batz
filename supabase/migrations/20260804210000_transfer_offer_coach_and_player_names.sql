-- The transfer-offer consent popup needs the actual offering coach's name
-- and the player's real first/last name (not just the PlayerTag) to match
-- the requested copy -- "Coach [Name] has identified you as the
-- Parent/Legal Guardian of [Player Name]". player_claim_request didn't
-- track who made a coach-initiated offer at all; add it.

alter table player_claim_request
  add column offered_by uuid references auth.users (id);

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

  insert into player_claim_request (roster_entry_id, player_id, requested_by, initiated_by, offered_by)
  values (p_roster_entry_id, v_player_id, p_target_user_id, 'coach', v_caller)
  returning id into v_new_request_id;

  return v_new_request_id;
end;
$$;

-- list_my_pending_transfer_offers now also returns the offering coach's
-- name and the player's real first/last name for the consent popup copy.
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
  left join coach_assignment ca on ca.team_id = re.team_id and ca.user_id = r.offered_by
  where r.requested_by = auth.uid() and r.initiated_by = 'coach' and r.status = 'pending';
$$;

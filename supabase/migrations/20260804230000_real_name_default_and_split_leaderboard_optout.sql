-- 1. Once a player is actually unlocked (claimed), default their display
-- to Real Name rather than leaving whatever display_mode default they
-- were sitting on while locked ('uniform') -- the parent can still change
-- it in Settings afterward, this only changes the starting point.
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
      display_mode = 'real_name',
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

-- attest_player_parent is the other unlock path (a coach confirming
-- they're their own kid's parent) -- same default applies.
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
  set parent_attested_at = now(), parent_attested_by = v_caller, is_coach_fallback = false, display_mode = 'real_name'
  where id = p_player_id;
end;
$$;

-- 2. Split the single leaderboard_opt_out toggle into an independent
-- Team-leaderboard and League-leaderboard opt-out -- a parent may want a
-- player excluded from the wider League/Division leaderboard without
-- also hiding them from their own team's.
alter table player add column leaderboard_opt_out_team boolean not null default false;
alter table player add column leaderboard_opt_out_league boolean not null default false;
update player set leaderboard_opt_out_team = leaderboard_opt_out, leaderboard_opt_out_league = leaderboard_opt_out;
alter table player drop column leaderboard_opt_out;

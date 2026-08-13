-- Home's "newly assigned" banner needs to distinguish two different
-- events with different copy (requested this turn):
--   - a fan's OWN claim request got approved by a coach -> "Coach X has
--     approved your request to unlock [Player]."
--   - a coach's offer (Transfer to Fan) -> already has its own distinct
--     "Coach X is offering you [Player] to unlock" card/consent flow
--     (PendingTransferOffer), so it must NOT also show up here.
-- respond_to_transfer_offer was setting newly_assigned=true too, which
-- would produce a duplicate Home banner with the wrong ("approved your
-- request") wording for an offer the fan didn't request -- stop setting
-- it there so this banner is unambiguously the "approved request" case.
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
      is_coach_fallback = false
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

-- Home-facing: players newly assigned to me that I haven't seen yet, now
-- also carrying the approving coach's name and the player's real
-- first/last name for the new copy. The approving coach is read off the
-- most recently approved parent-initiated claim request for this player
-- (approve_player_claim_request always stamps decided_by).
drop function if exists list_newly_assigned_players();
create or replace function list_newly_assigned_players()
returns table (
  player_id uuid,
  display_name text,
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
    p.id,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.player_tag),
    p.first_name,
    p.last_name,
    ca.first_name,
    ca.last_name
  from player p
  left join lateral (
    select r.decided_by
    from player_claim_request r
    where r.player_id = p.id and r.initiated_by = 'parent' and r.status = 'approved'
    order by r.decided_at desc
    limit 1
  ) latest_approval on true
  left join lateral (
    select re.team_id
    from roster_entry re
    where re.player_id = p.id
    order by re.created_at desc
    limit 1
  ) latest_roster on true
  left join coach_assignment ca on ca.team_id = latest_roster.team_id and ca.user_id = latest_approval.decided_by
  where p.parent_user_id = auth.uid() and p.newly_assigned = true;
$$;

-- Team Members needs to show a coach their own outstanding "Verify"/
-- transfer offers (initiated_by = 'coach'), since those are exactly the
-- pending rows count_pending_claim_requests_for_team just stopped
-- counting as "needs your review" -- they need SOME visibility on this
-- screen, plus a way to withdraw one, otherwise a coach who fat-fingered
-- a uniform number has no way to undo it short of a DB fix.
create or replace function list_pending_transfer_offers_for_team(p_team_id uuid)
returns table (
  request_id uuid,
  player_id uuid,
  player_name text,
  target_user_id uuid,
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
    r.player_id,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.player_tag),
    r.requested_by,
    r.created_at
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join player p on p.id = r.player_id
  where re.team_id = p_team_id and r.status = 'pending' and r.initiated_by = 'coach';
end;
$$;

-- Cancel a coach-initiated offer the requesting coach (or any coach on
-- the team) no longer wants to leave pending. Just marks it denied --
-- the underlying player stays as a locked/unclaimed roster spot, same as
-- any other never-claimed player, so it's still re-offerable via Verify
-- or gets swept up in the normal season-end anonymization if it never is.
create or replace function cancel_transfer_offer(p_request_id uuid) returns void
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
  if not exists (select 1 from coach_assignment where team_id = v_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;
  if v_initiated_by <> 'coach' then
    raise exception 'not_a_coach_initiated_offer';
  end if;
  if v_status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  update player_claim_request
  set status = 'denied', decided_by = v_caller, decided_at = now()
  where id = p_request_id;
end;
$$;

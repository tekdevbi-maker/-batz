-- count_pending_claim_requests_for_team and list_pending_claim_request_counts_for_coach
-- counted every pending player_claim_request row, including coach-initiated
-- "Verify" offers (initiated_by = 'coach') that are awaiting the TARGET
-- fan's decision, not the coach's. list_pending_claim_requests_for_team
-- (the actual approval queue rendered on Team Members) already excludes
-- those -- see 20260804160000_transfer_offer_and_unlink.sql -- so the
-- badge count and the queue it links to disagreed: a coach would see a
-- "1" badge with nothing to review, because the one pending row was their
-- own outstanding offer, not something for them to act on.
create or replace function count_pending_claim_requests_for_team(p_team_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_count int;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  select count(*) into v_count
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where re.team_id = p_team_id and r.status = 'pending' and r.initiated_by = 'parent';

  return v_count;
end;
$$;

create or replace function list_pending_claim_request_counts_for_coach()
returns table (team_id uuid, pending_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select re.team_id, count(*) as pending_count
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.status = 'pending'
    and r.initiated_by = 'parent'
    and exists (
      select 1 from coach_assignment ca
      where ca.team_id = re.team_id and ca.user_id = auth.uid()
    )
  group by re.team_id;
$$;

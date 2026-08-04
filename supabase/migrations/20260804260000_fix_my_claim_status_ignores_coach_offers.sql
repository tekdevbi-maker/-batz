-- get_my_claim_request_status is meant to answer "did I request to claim
-- this player myself, and what happened?" -- but it wasn't filtering by
-- initiated_by, so a coach-initiated offer (a different row, same
-- roster_entry_id/requested_by) was being picked up as if it were the
-- caller's own request. That made "Claim requested -- waiting for the
-- coach to approve" incorrectly show on the Player Profile at the same
-- time as the (correct) transfer-offer consent popup. Only ever look at
-- the caller's own initiated_by = 'parent' rows here.
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
  where roster_entry_id = p_roster_entry_id and requested_by = v_caller and initiated_by = 'parent'
  order by created_at desc
  limit 1;

  return v_status;
end;
$$;

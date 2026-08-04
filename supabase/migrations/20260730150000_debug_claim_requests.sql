-- TEMPORARY debug helper -- will be dropped again once the "Pending Claim
-- Requests" not-showing-up bug is diagnosed. No auth check deliberately,
-- since this is only ever called by the developer directly via REST while
-- debugging, never referenced from app code.
create or replace function debug_list_all_claim_requests()
returns table (
  id uuid,
  roster_entry_id uuid,
  player_id uuid,
  requested_by uuid,
  status text,
  created_at timestamptz,
  team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.roster_entry_id, r.player_id, r.requested_by, r.status, r.created_at, re.team_id
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  order by r.created_at desc;
$$;

create or replace function debug_list_coaches_for_team(p_team_id uuid)
returns table (user_id uuid, role text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select ca.user_id, ca.role, u.email::text
  from coach_assignment ca
  join auth.users u on u.id = ca.user_id
  where ca.team_id = p_team_id;
$$;

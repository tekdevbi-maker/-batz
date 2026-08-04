create or replace function debug_inspect_claim_requests(p_player_id uuid)
returns table (
  id uuid, roster_entry_id uuid, player_id uuid, requested_by uuid, requester_email text,
  status text, initiated_by text, offered_by uuid, offered_by_email text, decided_by uuid, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.roster_entry_id, r.player_id, r.requested_by, ru.email::text,
         r.status, r.initiated_by, r.offered_by, ou.email::text, r.decided_by, r.created_at
  from player_claim_request r
  left join auth.users ru on ru.id = r.requested_by
  left join auth.users ou on ou.id = r.offered_by
  where r.player_id = p_player_id
  order by r.created_at desc;
$$;

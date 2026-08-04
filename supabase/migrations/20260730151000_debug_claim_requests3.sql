create or replace function debug_list_pending_no_auth(p_team_id uuid)
returns table (
  request_id uuid,
  roster_entry_id uuid,
  player_id uuid,
  uniform_number int,
  requested_by uuid,
  requester_email text,
  requester_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.roster_entry_id,
    r.player_id,
    re.uniform_number,
    r.requested_by,
    u.email::text,
    coalesce(nullif(trim(coalesce(tm.first_name, '') || ' ' || coalesce(tm.last_name, '')), ''), u.email::text),
    r.created_at
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join auth.users u on u.id = r.requested_by
  left join team_membership tm on tm.team_id = re.team_id and tm.user_id = r.requested_by
  where re.team_id = p_team_id and r.status = 'pending'
  order by r.created_at;
$$;

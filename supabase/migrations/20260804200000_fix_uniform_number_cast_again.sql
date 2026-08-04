-- Same bug as 20260730153000_fix_uniform_number_type_mismatch.sql:
-- roster_entry.uniform_number is smallint, but 20260804160000's rewrite of
-- list_pending_claim_requests_for_team (adding the player_name column)
-- redeclared uniform_number as plain int without re-adding the explicit
-- cast -- plpgsql's RETURN QUERY requires an exact type match against the
-- declared RETURNS TABLE columns, unlike a language sql function.
create or replace function list_pending_claim_requests_for_team(p_team_id uuid)
returns table (
  request_id uuid,
  roster_entry_id uuid,
  player_id uuid,
  uniform_number int,
  player_name text,
  requested_by uuid,
  requester_email text,
  requester_name text,
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
    r.roster_entry_id,
    r.player_id,
    re.uniform_number::int,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), '#' || re.uniform_number::text),
    r.requested_by,
    u.email::text,
    coalesce(nullif(trim(coalesce(tm.first_name, '') || ' ' || coalesce(tm.last_name, '')), ''), u.email::text),
    r.created_at
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  join auth.users u on u.id = r.requested_by
  left join player p on p.id = r.player_id
  left join team_membership tm on tm.team_id = re.team_id and tm.user_id = r.requested_by
  where re.team_id = p_team_id and r.status = 'pending' and r.initiated_by = 'parent'
  order by r.created_at;
end;
$$;

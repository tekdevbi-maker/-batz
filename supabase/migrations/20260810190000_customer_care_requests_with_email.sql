-- Backs the admin Customer Care Requests list with the requester's email,
-- since PostgREST can't query auth.users directly (same reasoning as
-- list_all_users_for_impersonation / get_team_members).
create or replace function list_customer_care_requests_admin()
returns table (
  id uuid,
  requester_user_id uuid,
  requester_email text,
  team_id uuid,
  category text,
  description text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'not_an_admin';
  end if;

  return query
    select r.id, r.requester_user_id, u.email::text, r.team_id, r.category, r.description, r.status, r.created_at
    from customer_care_request r
    join auth.users u on u.id = r.requester_user_id
    order by r.created_at desc;
end;
$$;

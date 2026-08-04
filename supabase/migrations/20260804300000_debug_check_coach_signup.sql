create or replace function debug_check_coach_signup(p_email text)
returns table (email text, created_at timestamptz, team_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.email::text, u.created_at, t.name
  from auth.users u
  left join coach_assignment ca on ca.user_id = u.id
  left join team t on t.id = ca.team_id
  where u.email = p_email;
$$;

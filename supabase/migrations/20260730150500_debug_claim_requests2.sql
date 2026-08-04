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

-- Backs the autosuggest on the Impersonate-a-User field: admin-only list
-- of every account's email, since PostgREST can't query auth.users
-- directly (same reasoning as get_team_members).
create or replace function list_all_users_for_impersonation()
returns table (email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'not_an_admin';
  end if;

  return query select u.email::text from auth.users u order by u.email;
end;
$$;

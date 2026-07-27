-- Audit trail for admin impersonation (spec: "log in as a user to check
-- bugs they're reporting"). Written by the admin-impersonate Edge
-- Function via the service role, which bypasses RLS -- so this table
-- gets a default-deny policy set: no direct client access at all, not
-- even for admins, since the Edge Function is the only sanctioned writer
-- and reads happen through a dedicated RPC (below) instead.
create table admin_impersonation_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id),
  target_user_id uuid not null references auth.users (id),
  target_email text not null,
  created_at timestamptz not null default now()
);

alter table admin_impersonation_log enable row level security;

-- Admin-only read access, via RPC rather than a direct table policy, so
-- the query stays consistent with is_app_admin() (SECURITY DEFINER,
-- bypasses RLS recursion) instead of a raw EXISTS policy against
-- app_admin. No RLS SELECT policy exists otherwise -- this is the sole
-- read path for anyone other than the service role.
create or replace function get_impersonation_log(p_limit int default 100)
returns table (
  id uuid,
  admin_email text,
  target_email text,
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
  select l.id, au.email::text, l.target_email, l.created_at
  from admin_impersonation_log l
  join auth.users au on au.id = l.admin_user_id
  order by l.created_at desc
  limit p_limit;
end;
$$;

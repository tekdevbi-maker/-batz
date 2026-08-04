create or replace function debug_check_age_attested(p_email text)
returns table (email text, age_attested_at text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.email::text, u.raw_user_meta_data->>'age_attested_at', u.created_at
  from auth.users u
  where u.email = p_email;
$$;

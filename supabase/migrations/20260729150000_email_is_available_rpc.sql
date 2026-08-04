-- Lets the Coach Register flow's first page ("Continue to Team
-- Registration") check whether an email is already taken WITHOUT creating
-- an account -- signUp() itself is the only thing that can create one, and
-- it now only ever runs on page 2's "Complete Registration". Callable by
-- anon (no session exists yet at this point in the flow), same as the
-- existing anon-readable league/division RLS policies.
create or replace function email_is_available(p_email text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

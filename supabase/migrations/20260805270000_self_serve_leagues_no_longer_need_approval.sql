-- Leagues created by a coach self-serving through the registration wizard
-- ("Or...Make Your Own League") no longer sit in an admin-verification
-- queue -- they're usable immediately. Replaces the old pending-only
-- self-serve insert policy with one that allows any status, since the
-- app-side call now inserts verification_status = 'verified' directly
-- (see createVerifiedLeague / dev-register-confirm.tsx). The admin
-- verification UI/columns are left in place (unused for new leagues going
-- forward, but harmless, and still meaningful for anything already
-- pending from before this change).
drop policy "authenticated can propose a new league (pending)" on league;

create policy "authenticated can create leagues" on league for insert
  to authenticated
  with check (true);

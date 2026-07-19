-- The /join/[teamId] screen (spec Section 4) needs to show Team/Division/
-- League/Coach context BEFORE the parent creates an account (that's the
-- whole point of clicking the link -- to see what they're joining first).
-- The existing SELECT policies on these tables were scoped `to
-- authenticated` only, so a not-yet-signed-up parent (role `anon`) got
-- "Cannot coerce the result to a single JSON object" instead of the
-- invite. Same non-sensitive reference data as before (team/league names,
-- a coach's display name for their own team) -- just also open to anon.
create policy "anon can read leagues" on league for select
  to anon
  using (true);

create policy "anon can read divisions" on division for select
  to anon
  using (true);

create policy "anon can read teams" on team for select
  to anon
  using (true);

create policy "anon can read coach assignments" on coach_assignment for select
  to anon
  using (true);

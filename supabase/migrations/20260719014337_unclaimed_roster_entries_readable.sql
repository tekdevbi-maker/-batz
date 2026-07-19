-- A parent working through the join flow (spec Section 4) isn't yet a
-- coach or team_membership holder for the team they're joining, so the
-- existing SELECT policies on roster_entry don't cover them -- but they
-- need to check whether an unclaimed spot (created by a prior game import)
-- already exists for their kid's uniform number. Scoped to unclaimed rows
-- only: once a spot is claimed, it falls back to the coach/member-only
-- policies.
create policy "authenticated can read unclaimed roster entries" on roster_entry for select
  to authenticated
  using (player_id is null);

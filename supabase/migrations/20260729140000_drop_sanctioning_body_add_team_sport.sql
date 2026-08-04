-- Sanctioning Body was collected at league-registration time and shown
-- once on the admin League list, but never read by any RLS policy, filter,
-- join, or leaderboard -- confirmed unused beyond those two points, so
-- it's being dropped outright rather than kept as dead weight.
alter table league drop column if exists sanctioning_body;

-- New "Sport" selector (Baseball/Softball) on the team registration
-- screens, placed under League Name -- lives on team (not league), since a
-- league can plausibly host both sports across different divisions/teams.
-- Defaults existing/omitted rows to Baseball, matching every team created
-- so far.
alter table team add column if not exists sport text not null default 'Baseball' check (sport in ('Baseball', 'Softball'));

-- Backs the DEV registration wizard's historical-stats path: a team
-- entered purely to backfill a completed season's stats is created
-- Inactive so it never counts toward or appears on any leaderboard, but
-- still gets a real Follow link so parents can claim players and keep
-- their kid's historical stats. Distinct from season_status ('in_season'/
-- 'ended'), which tracks whether an otherwise-normal team's current season
-- has wrapped up, not whether the team should ever compete at all.
alter table team add column if not exists is_active boolean not null default true;

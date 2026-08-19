-- One-time backfill: mark_season_ended only started posting the
-- "season_ended" activity item as of 20260819151546. Any team whose
-- season was already marked complete before that point never got a post,
-- even though its anonymized_* running total (and Team Home's tiles, per
-- the earlier fix) already reflect the full season. This inserts the
-- missing post for every already-ended team, computed the same way
-- mark_season_ended itself computes it: anonymized_* plus whatever's
-- still left in game_batting_stat for that team's games.
insert into activity_feed_item (
  team_id, category, total_ab, total_h, total_singles, total_doubles,
  total_triples, total_hr, total_rbi, total_bb, total_hbp, total_sf
)
select
  t.id,
  'season_ended',
  t.anonymized_ab + coalesce(sums.ab, 0),
  t.anonymized_h + coalesce(sums.h, 0),
  t.anonymized_singles + coalesce(sums.singles, 0),
  t.anonymized_doubles + coalesce(sums.doubles, 0),
  t.anonymized_triples + coalesce(sums.triples, 0),
  t.anonymized_hr + coalesce(sums.hr, 0),
  t.anonymized_rbi + coalesce(sums.rbi, 0),
  t.anonymized_bb + coalesce(sums.bb, 0),
  t.anonymized_hbp + coalesce(sums.hbp, 0),
  t.anonymized_sf + coalesce(sums.sf, 0)
from team t
left join (
  select g.team_id,
    sum(gbs.ab) as ab, sum(gbs.h) as h, sum(gbs.singles) as singles,
    sum(gbs.doubles) as doubles, sum(gbs.triples) as triples, sum(gbs.hr) as hr,
    sum(gbs.rbi) as rbi, sum(gbs.bb) as bb, sum(gbs.hbp) as hbp, sum(gbs.sf) as sf
  from game_batting_stat gbs
  join game g on g.id = gbs.game_id
  group by g.team_id
) sums on sums.team_id = t.id
where t.season_status = 'ended'
  and not exists (
    select 1 from activity_feed_item afi where afi.team_id = t.id and afi.category = 'season_ended'
  );

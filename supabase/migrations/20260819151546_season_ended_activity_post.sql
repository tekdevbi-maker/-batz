-- Team-wide "season ended" activity post, shown right when a Head Coach
-- marks a season complete: a friendly sign-off plus the team's full-season
-- totals across every metric the Team Leaders board tracks (spec Section
-- 8's category list -- Hits/2B/3B/HR/RBI/BB, with AVG/OBP/SLG/OPS derived
-- client-side from the same counts). Not tied to a player or a single
-- game, so game_id needs to become nullable the same way player_id/tier
-- already did for 'game_imported' posts.
alter table activity_feed_item alter column game_id drop not null;

alter table activity_feed_item drop constraint activity_feed_item_category_check;
alter table activity_feed_item add constraint activity_feed_item_category_check
  check (category in ('hits', 'doubles', 'triples', 'home_runs', 'game_imported', 'season_ended'));

alter table activity_feed_item add column if not exists total_ab integer;
alter table activity_feed_item add column if not exists total_h integer;
alter table activity_feed_item add column if not exists total_singles integer;
alter table activity_feed_item add column if not exists total_doubles integer;
alter table activity_feed_item add column if not exists total_triples integer;
alter table activity_feed_item add column if not exists total_hr integer;
alter table activity_feed_item add column if not exists total_rbi integer;
alter table activity_feed_item add column if not exists total_bb integer;
alter table activity_feed_item add column if not exists total_hbp integer;
alter table activity_feed_item add column if not exists total_sf integer;

-- Extends mark_season_ended (20260814030000_season_end_anonymization.sql)
-- with the feed post, computed from the SAME final numbers Team Home now
-- shows post-anonymization: the just-updated anonymized_* running total
-- plus whatever game_batting_stat rows are still left for this team's
-- games (claimed players, whose rows are untouched by this function).
create or replace function mark_season_ended(p_team_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_name text;
  v_ab int; v_h int; v_singles int; v_doubles int; v_triples int;
  v_hr int; v_rbi int; v_bb int; v_hbp int; v_sf int;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller and role = 'primary'
  ) then
    raise exception 'not_head_coach';
  end if;

  update team t set
    anonymized_ab = t.anonymized_ab + coalesce(sums.ab, 0),
    anonymized_h = t.anonymized_h + coalesce(sums.h, 0),
    anonymized_singles = t.anonymized_singles + coalesce(sums.singles, 0),
    anonymized_doubles = t.anonymized_doubles + coalesce(sums.doubles, 0),
    anonymized_triples = t.anonymized_triples + coalesce(sums.triples, 0),
    anonymized_hr = t.anonymized_hr + coalesce(sums.hr, 0),
    anonymized_rbi = t.anonymized_rbi + coalesce(sums.rbi, 0),
    anonymized_bb = t.anonymized_bb + coalesce(sums.bb, 0),
    anonymized_hbp = t.anonymized_hbp + coalesce(sums.hbp, 0),
    anonymized_sf = t.anonymized_sf + coalesce(sums.sf, 0)
  from (
    select
      sum(gbs.ab) as ab, sum(gbs.h) as h, sum(gbs.singles) as singles,
      sum(gbs.doubles) as doubles, sum(gbs.triples) as triples, sum(gbs.hr) as hr,
      sum(gbs.rbi) as rbi, sum(gbs.bb) as bb, sum(gbs.hbp) as hbp, sum(gbs.sf) as sf
    from roster_entry re
    left join player p on p.id = re.player_id
    join game_batting_stat gbs on gbs.roster_entry_id = re.id
    where re.team_id = p_team_id and (re.player_id is null or p.is_coach_fallback = true)
  ) sums
  where t.id = p_team_id;

  delete from player
  where id in (
    select re.player_id from roster_entry re
    join player p on p.id = re.player_id
    where re.team_id = p_team_id and p.is_coach_fallback = true
  );

  delete from roster_entry
  where team_id = p_team_id and player_id is null;

  update team set season_status = 'ended' where id = p_team_id;

  -- Final totals for the feed post: the anonymized running total (just
  -- updated above) plus whatever's left in game_batting_stat for this
  -- team's games -- the exact same sum Team Home's tiles now show.
  select t.anonymized_ab, t.anonymized_h, t.anonymized_singles, t.anonymized_doubles,
         t.anonymized_triples, t.anonymized_hr, t.anonymized_rbi, t.anonymized_bb,
         t.anonymized_hbp, t.anonymized_sf, t.name
  into v_ab, v_h, v_singles, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_hbp, v_sf, v_team_name
  from team t where t.id = p_team_id;

  select
    v_ab + coalesce(sum(gbs.ab), 0), v_h + coalesce(sum(gbs.h), 0),
    v_singles + coalesce(sum(gbs.singles), 0), v_doubles + coalesce(sum(gbs.doubles), 0),
    v_triples + coalesce(sum(gbs.triples), 0), v_hr + coalesce(sum(gbs.hr), 0),
    v_rbi + coalesce(sum(gbs.rbi), 0), v_bb + coalesce(sum(gbs.bb), 0),
    v_hbp + coalesce(sum(gbs.hbp), 0), v_sf + coalesce(sum(gbs.sf), 0)
  into v_ab, v_h, v_singles, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_hbp, v_sf
  from game_batting_stat gbs
  join game g on g.id = gbs.game_id
  where g.team_id = p_team_id;

  insert into activity_feed_item (
    team_id, category, total_ab, total_h, total_singles, total_doubles,
    total_triples, total_hr, total_rbi, total_bb, total_hbp, total_sf
  ) values (
    p_team_id, 'season_ended', v_ab, v_h, v_singles, v_doubles,
    v_triples, v_hr, v_rbi, v_bb, v_hbp, v_sf
  );
end;
$$;

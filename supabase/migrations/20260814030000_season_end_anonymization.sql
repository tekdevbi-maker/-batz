-- Gap #4 (COPPA data retention): a coach can import real game stats
-- (including real names) for players who never get claimed by a parent.
-- Keeping that identity data indefinitely has no ongoing consent behind
-- it. This adds the actual season-end anonymization mechanism designed
-- this session: when a Head Coach marks a season complete, every still-
-- unclaimed roster spot's stats get folded into an anonymous team total,
-- and the identity data (name, photo, uniform number) is permanently
-- deleted -- not just hidden. There is no way to reclaim an unclaimed
-- player after this point.
--
-- team is already season-scoped (one row per team/season/year), so the
-- anonymous total lives directly on the team row rather than a new table.
alter table team add column if not exists anonymized_ab integer not null default 0;
alter table team add column if not exists anonymized_h integer not null default 0;
alter table team add column if not exists anonymized_singles integer not null default 0;
alter table team add column if not exists anonymized_doubles integer not null default 0;
alter table team add column if not exists anonymized_triples integer not null default 0;
alter table team add column if not exists anonymized_hr integer not null default 0;
alter table team add column if not exists anonymized_rbi integer not null default 0;
alter table team add column if not exists anonymized_bb integer not null default 0;
alter table team add column if not exists anonymized_hbp integer not null default 0;
alter table team add column if not exists anonymized_sf integer not null default 0;

-- Replaces the plain client-side `.update({season_status:"ended"})` --
-- moved server-side so the anonymization step can't be skipped, and so
-- the head-coach-only check is enforced here too, not just relied on via
-- RLS on the `team` table's own update policy.
create or replace function mark_season_ended(p_team_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller and role = 'primary'
  ) then
    raise exception 'not_head_coach';
  end if;

  -- Fold every still-unclaimed roster spot's career stats into the
  -- team's running anonymous total BEFORE the identifying rows are
  -- deleted. "Unclaimed" = no roster_entry.player_id at all, or a player
  -- row that's still the coach-fallback placeholder (never actually
  -- claimed by a real parent).
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

  -- Delete the coach-fallback placeholder identity rows outright (not a
  -- soft-delete/flag) -- cascades follow, activity_feed_item, and
  -- player_claim_request rows tied to them, and nulls out the
  -- referencing roster_entry.player_id.
  delete from player
  where id in (
    select re.player_id from roster_entry re
    join player p on p.id = re.player_id
    where re.team_id = p_team_id and p.is_coach_fallback = true
  );

  -- Delete the roster spots themselves (their own first_name/last_name/
  -- uniform_number columns, separate from player's) -- cascades their
  -- game_batting_stat rows, already folded into the anonymous total
  -- above. Only ever targets spots with no real, claimed owner.
  delete from roster_entry
  where team_id = p_team_id and player_id is null;

  update team set season_status = 'ended' where id = p_team_id;
end;
$$;

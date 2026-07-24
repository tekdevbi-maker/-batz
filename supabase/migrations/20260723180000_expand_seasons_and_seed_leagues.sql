-- Coach Registration now offers all four seasons instead of just
-- Spring/Fall. Find and drop the existing inline check constraint on
-- team.season dynamically rather than assuming its auto-generated name,
-- since that name isn't guaranteed across Postgres versions.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'team'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%season%';

  if v_constraint_name is not null then
    execute format('alter table team drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table team add constraint team_season_check
  check (season in ('Spring', 'Summer', 'Fall', 'Winter'));

-- Starter league list for Seminole/Orange County (coach registration's
-- League Name dropdown) -- pre-verified so new coaches don't hit the
-- pending-review hold for these. Initials assigned first-come-first-served
-- per lib/leagueInitials.ts's collision rule; all 21 are unique today, but
-- inserted in this fixed order so any FUTURE self-serve league that
-- happens to derive the same initials collides against these, not the
-- other way around.
insert into league (name, sanctioning_body, initials, verification_status)
values
  ('Altamonte Baseball Academy', 'Independent', 'ABA', 'verified'),
  ('Apopka Little League', 'Little League', 'ALL', 'verified'),
  ('Casselberry Little League', 'Little League', 'CLL', 'verified'),
  ('Dr. Phillips Little League', 'Little League', 'DPLL', 'verified'),
  ('East Orange Babe Ruth', 'Babe Ruth League', 'EOBR', 'verified'),
  ('Forest City Little League', 'Little League', 'FCLL', 'verified'),
  ('Hunter''s Creek Little League', 'Little League', 'HCLL', 'verified'),
  ('Lake Mary Little League', 'Little League', 'LMLL', 'verified'),
  ('Longwood Babe Ruth', 'Babe Ruth League', 'LBR', 'verified'),
  ('Maitland Little League', 'Little League', 'MLL', 'verified'),
  ('North Orlando Kiwanis Little League', 'Little League', 'NOKLL', 'verified'),
  ('Northwest Little League', 'Little League', 'NWLL', 'verified'),
  ('Oviedo Babe Ruth', 'Babe Ruth League', 'OBR', 'verified'),
  ('Oviedo Little League', 'Little League', 'OLL', 'verified'),
  ('Rolling Hills Little League', 'Little League', 'RHLL', 'verified'),
  ('Sanford Cal Ripken & Babe Ruth Baseball', 'Babe Ruth League', 'SCRBR', 'verified'),
  ('South Orlando Babe Ruth', 'Babe Ruth League', 'SOBR', 'verified'),
  ('Union Park Little League', 'Little League', 'UPLL', 'verified'),
  ('Windermere Little League', 'Little League', 'WLL', 'verified'),
  ('Winter Park Babe Ruth', 'Babe Ruth League', 'WPBR', 'verified'),
  ('Winter Springs Youth Baseball and Softball', 'Independent', 'WSYBS', 'verified')
on conflict do nothing;

-- User-requested cleanup of the league catalog:
-- 1. Collapse any leagues that share the same `name` down to a single row.
-- 2. Strip literal "(" / ")" characters from names, keeping the text that
--    was inside them (e.g. "Alexandria Little League (KY)" ->
--    "Alexandria Little League KY") -- these state-code suffixes are the
--    only thing distinguishing otherwise-identical league names across
--    states, so the text itself is kept, only the parens go.
--
-- Order matters: strip parens FIRST, then dedupe -- some duplicates (like
-- the "Winter Park Babe Ruth" ones from the autosuggest bug) already share
-- an identical name with no parens involved, and stripping parens first
-- means any name collisions that emerge from the strip are also caught by
-- the same dedupe pass.
do $$
begin
  update league set name = regexp_replace(name, '[()]', '', 'g') where name ~ '[()]';

  -- Pick one canonical row per duplicate name: prefer verified over
  -- pending, then the oldest row.
  with ranked as (
    select id, name,
      row_number() over (
        partition by name
        order by (verification_status = 'verified') desc, created_at asc, id asc
      ) as rn
    from league
  ),
  canonical as (
    select d.name, d.id as keep_id, r.id as dupe_id
    from ranked r
    join ranked d on d.name = r.name and d.rn = 1
    where r.rn > 1
  )
  update division d
  set league_id = c.keep_id
  from canonical c
  where d.league_id = c.dupe_id;

  with ranked as (
    select id, name,
      row_number() over (
        partition by name
        order by (verification_status = 'verified') desc, created_at asc, id asc
      ) as rn
    from league
  )
  delete from league where id in (select id from ranked where rn > 1);
end $$;

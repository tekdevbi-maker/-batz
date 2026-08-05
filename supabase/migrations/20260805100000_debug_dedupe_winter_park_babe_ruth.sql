-- One-off cleanup: the "What league do you represent?" autosuggest had a
-- bug (listLeagues() silently truncated at PostgREST's 1000-row default,
-- cutting off everything alphabetically past ~"T") that caused repeated
-- registration attempts to not recognize "Winter Park Babe Ruth" as
-- already existing, creating 4 duplicate league rows (3 pending + 1
-- extra verified) each with an empty, team-less division. Fixed in
-- app/lib/leaguesRepository.ts (paginated fetch). This migration removes
-- the leftover duplicate data; the canonical league (879a7fb3-f789-40df-
-- 84ee-7dbea8c57c41) already has its real division set and is untouched.
do $$
begin
  delete from division where id in (
    '6a569526-f338-4926-9b85-9fbc021e0f9a',
    'a2bef9ba-1123-4e37-946d-24f2990cfaf4',
    '1008029a-dba5-4a77-bbd1-5b9dc7569377'
  );

  delete from league where id in (
    'c1073bbe-9728-46eb-bf93-d5474286734c',
    '1be7b007-bc94-48db-bbd9-de4b8b95c01c',
    '162a70de-67cd-4691-aeb3-f5f6aafedd48',
    'cf145fa9-43e1-42f1-a4b1-e1dccf1738ed'
  );
end $$;

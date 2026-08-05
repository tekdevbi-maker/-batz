drop function if exists debug_setup_orphan_test(uuid);
drop function if exists debug_check_orphan_cleanup(uuid[]);

-- Also remove the leftover "Other Game" test game and its players/stats
-- created for this test -- not part of the app's real seed data.
do $$
begin
  delete from game where file_hash = 'debugtesthash2';
  delete from player where player_tag in ('DebugOrphanTag2', 'DebugOrphanTag3');
end $$;

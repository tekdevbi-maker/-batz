-- game_batting_stat.roster_entry_id had no ON DELETE behavior, so removing
-- a roster_entry (spec Section 4: a coach can remove a wrong-team roster
-- spot) failed with a foreign key violation whenever any per-game stats
-- already referenced it -- and blocked any upstream cascade (e.g.
-- league -> division -> team -> roster_entry) too. Deleting a roster_entry
-- should clean up its own stat rows the same way deleting a Game already
-- does (spec Section 3a: "no audit log, kept simple by design").
alter table game_batting_stat drop constraint game_batting_stat_roster_entry_id_fkey;
alter table game_batting_stat add constraint game_batting_stat_roster_entry_id_fkey
  foreign key (roster_entry_id) references roster_entry (id) on delete cascade;

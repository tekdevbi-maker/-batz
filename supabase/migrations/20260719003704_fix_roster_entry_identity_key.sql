-- Sprint 1's roster_entry unique constraint was on (team_id, uniform_number),
-- but spec Section 3a is explicit that jersey number is "display only, not
-- identity" -- roster matching uses Last/First name instead, and a number
-- can be reassigned game-to-game. Enforcing uniqueness on the non-identity
-- field caused real false-conflict failures (surfaced by
-- app/scripts/verify-import.ts) when two players' numbers happened to
-- collide across games. The identity key should be the name, matching what
-- app/lib/gamesRepository.ts actually uses to match/create roster entries.
alter table roster_entry drop constraint roster_entry_team_id_uniform_number_key;
alter table roster_entry add constraint roster_entry_team_id_name_key unique (team_id, last_name, first_name);

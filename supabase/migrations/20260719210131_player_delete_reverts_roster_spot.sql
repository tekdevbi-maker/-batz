-- Spec Section 4 deletion authority: "Only the Parent can delete a Player
-- profile entirely. When they do, the underlying roster spot is NOT
-- removed from the team or its game history -- it reverts to the default
-- auto-generated unclaimed entry ... the same as a never-claimed roster
-- spot. This preserves team and game history integrity even after a
-- parent walks away."
--
-- roster_entry.player_id had no ON DELETE behavior, which BLOCKED player
-- deletion outright with a foreign key violation (surfaced during Sprint 6
-- cleanup). SET NULL is the spec's behavior verbatim: player_id null IS
-- the unclaimed state, and the display layer already renders such spots
-- with the computed default PlayerTag. The parent-facing delete UI comes
-- later; the schema semantics belong here.
alter table roster_entry drop constraint roster_entry_player_id_fkey;
alter table roster_entry add constraint roster_entry_player_id_fkey
  foreign key (player_id) references player (id) on delete set null;

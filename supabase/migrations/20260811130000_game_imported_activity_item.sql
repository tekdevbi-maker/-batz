-- Team-wide "a new game was imported" activity post: not tied to a single
-- player, so player_id and tier become nullable and category gains a
-- fourth, non-milestone value. can_view_player(null) already returns true
-- (see team_roles_and_privacy_overhaul.sql), so the existing select/like
-- RLS policies cover the new null-player_id rows with no changes.
alter table activity_feed_item alter column player_id drop not null;
alter table activity_feed_item alter column tier drop not null;

alter table activity_feed_item drop constraint activity_feed_item_category_check;
alter table activity_feed_item add constraint activity_feed_item_category_check
  check (category in ('hits', 'doubles', 'triples', 'home_runs', 'game_imported'));

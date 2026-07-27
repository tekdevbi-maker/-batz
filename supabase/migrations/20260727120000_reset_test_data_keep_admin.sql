-- One-time data reset (user request): clear all test teams, players,
-- games, coaches, members, and every account except tekdevbi@gmail.com.
-- League/Division catalog is kept intact. Aborts loudly instead of
-- deleting everyone if that account can't be found, since this is
-- irreversible.
do $$
declare
  v_keep_user uuid;
begin
  select id into v_keep_user from auth.users where email = 'tekdevbi@gmail.com';
  if v_keep_user is null then
    raise exception 'tekdevbi@gmail.com not found -- aborting reset';
  end if;

  delete from block_or_report;
  delete from customer_care_request;

  -- Cascades away roster_entry, game, game_batting_stat, coach_assignment,
  -- team_membership, activity_feed_item, activity_feed_like.
  delete from team;

  -- Cascades away follow (player_id fk).
  delete from player;

  delete from app_admin where user_id <> v_keep_user;
  update league set admin_user_id = null where admin_user_id <> v_keep_user;

  delete from auth.users where id <> v_keep_user;
end $$;

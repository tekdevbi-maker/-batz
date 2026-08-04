-- #ClearOut: repeat data reset per user request. Same procedure as
-- 20260727120000_reset_test_data_keep_admin.sql / 20260728120000_clear_out_2.sql /
-- 20260728130000_clear_out_3.sql / 20260729120000_clear_out_4.sql /
-- 20260729130000_clear_out_5.sql -- clears all test teams/players/games/
-- coaches/members and every account except tekdevbi@gmail.com, keeps the
-- League/Division catalog intact.
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
  delete from admin_impersonation_log;

  -- Cascades away roster_entry, game, game_batting_stat, coach_assignment,
  -- team_membership, activity_feed_item, activity_feed_like,
  -- player_transfer_invite.
  delete from team;

  -- Cascades away follow (player_id fk). The BEFORE DELETE fallback
  -- trigger on auth.users (reassign_players_to_foster_parent) is a no-op
  -- here since every player row is already gone by the time users are
  -- deleted below.
  delete from player;

  delete from app_admin where user_id <> v_keep_user;
  update league set admin_user_id = null where admin_user_id <> v_keep_user;

  delete from auth.users where id <> v_keep_user;
end $$;

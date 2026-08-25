-- Parent-facing "merge my players" (v2 backlog item, now built): fixes the
-- case where a coach misspelled a player's name, so the existing
-- exact-name-match auto-dedupe (merge_player_into_existing) never fires and
-- the parent ends up owning two separate profiles for the same real kid.
-- Unlike the automatic dedupe, this is caller-driven -- the parent
-- explicitly picks which of their own players to keep and which duplicate
-- to merge away, regardless of whether the names match.
create or replace function merge_my_players(p_keep_player_id uuid, p_merge_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_keep_parent uuid;
  v_merge_parent uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if p_keep_player_id = p_merge_player_id then
    raise exception 'cannot_merge_player_with_itself';
  end if;

  select parent_user_id into v_keep_parent from player where id = p_keep_player_id;
  select parent_user_id into v_merge_parent from player where id = p_merge_player_id;

  if v_keep_parent is null or v_merge_parent is null then
    raise exception 'player_not_found';
  end if;
  if v_keep_parent <> v_caller or v_merge_parent <> v_caller then
    raise exception 'not_your_player';
  end if;

  update roster_entry set player_id = p_keep_player_id where player_id = p_merge_player_id;
  update activity_feed_item set player_id = p_keep_player_id where player_id = p_merge_player_id;

  insert into follow (follower_user_id, player_id)
  select follower_user_id, p_keep_player_id from follow where player_id = p_merge_player_id
  on conflict (follower_user_id, player_id) do nothing;
  delete from follow where player_id = p_merge_player_id;

  -- Cascades away game_batting_stat implicitly: those rows are keyed to
  -- roster_entry_id, and every roster_entry pointing at the merged-away
  -- player was just repointed to the kept one above.
  delete from player where id = p_merge_player_id;
end;
$$;

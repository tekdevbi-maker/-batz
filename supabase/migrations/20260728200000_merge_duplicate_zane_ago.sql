-- One-off data fix: parent@test.com's player Zane Ago ended up as two
-- separate `player` rows -- almost certainly because he was auto-claimed
-- fresh on a second team/season (matchOrCreateRosterEntries only matches
-- an imported name against ITS OWN team's roster, never across teams), so
-- his stats were split across two profiles instead of accumulating on one.
-- Keeps whichever of the two rows already has more roster_entry history
-- (tie-broken by earliest created_at, i.e. the original), repoints
-- everything the duplicate owned onto it, then removes the duplicate.
do $$
declare
  v_parent_id uuid;
  v_keep_id uuid;
  v_dup_id uuid;
begin
  select id into v_parent_id from auth.users where email = 'parent@test.com';
  if v_parent_id is null then
    raise notice 'parent@test.com not found -- skipping';
    return;
  end if;

  select p.id into v_keep_id
  from player p
  where p.parent_user_id = v_parent_id
    and lower(trim(coalesce(p.first_name, ''))) = 'zane'
    and lower(trim(coalesce(p.last_name, ''))) = 'ago'
  order by (select count(*) from roster_entry re where re.player_id = p.id) desc, p.created_at asc
  limit 1;

  if v_keep_id is null then
    raise notice 'No Zane Ago player found for parent@test.com -- skipping';
    return;
  end if;

  for v_dup_id in
    select p.id from player p
    where p.parent_user_id = v_parent_id
      and lower(trim(coalesce(p.first_name, ''))) = 'zane'
      and lower(trim(coalesce(p.last_name, ''))) = 'ago'
      and p.id <> v_keep_id
  loop
    update roster_entry set player_id = v_keep_id where player_id = v_dup_id;
    update activity_feed_item set player_id = v_keep_id where player_id = v_dup_id;

    insert into follow (follower_user_id, player_id)
    select follower_user_id, v_keep_id from follow where player_id = v_dup_id
    on conflict (follower_user_id, player_id) do nothing;
    delete from follow where player_id = v_dup_id;

    delete from player where id = v_dup_id;
    raise notice 'Merged duplicate player % into %', v_dup_id, v_keep_id;
  end loop;
end $$;

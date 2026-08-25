-- Coach-facing "Delete Player": fully removes an unclaimed (coach-fallback)
-- roster spot, including its batting stats, so a coach can fix a duplicate
-- or wrongly-added player without waiting for its last game to be deleted
-- (the existing auto-cleanup in delete_game_and_cleanup_roster). A player a
-- real parent has claimed is never eligible -- same "claimed players never
-- deleted" protection as the rest of the app; use Unlink Player for those.
create or replace function delete_unclaimed_player(p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_roster_entry_id uuid;
  v_is_fallback boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select is_coach_fallback into v_is_fallback from player where id = p_player_id;
  if v_is_fallback is null then
    raise exception 'player_not_found';
  end if;
  if not v_is_fallback then
    raise exception 'player_is_claimed';
  end if;

  select re.id, re.team_id into v_roster_entry_id, v_team_id
  from roster_entry re
  where re.player_id = p_player_id
  order by re.created_at desc
  limit 1;

  if v_team_id is null then
    raise exception 'no_roster_entry_found';
  end if;

  if not exists (
    select 1 from coach_assignment
    where team_id = v_team_id and user_id = v_caller and role = 'primary'
  ) then
    raise exception 'not_authorized_to_delete';
  end if;

  -- Cascades away every game_batting_stat row for this roster spot.
  delete from roster_entry where player_id = p_player_id;
  delete from player where id = p_player_id;
end;
$$;

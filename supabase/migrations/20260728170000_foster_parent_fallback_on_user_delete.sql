-- "Foster Parent" fallback (coach requested): a Player's stats must never
-- be lost just because the real parent's account goes away. player.parent_user_id
-- references auth.users with the default RESTRICT action, so as it stood, a
-- parent deleting their account would simply fail with a FK violation --
-- not silently lose data, but block deletion entirely with no path forward.
--
-- This trigger runs BEFORE the auth.users row is deleted (so the FK is
-- still satisfiable at the moment we rewrite it) and reassigns every Player
-- the departing user owns to that Player's current team's Head Coach --
-- the same "auto-claim" owner a never-claimed roster spot gets at import
-- time (see auto_claim_roster_entry). Reverts reveal_full_name to false so
-- a coach standing in as Foster Parent never displays the child's real
-- name -- the PlayerTag pseudonym takes over, exactly like a fresh
-- auto-claim. If no Head Coach can be found for a Player (no roster_entry,
-- or the team currently has no primary coach_assignment), the reassignment
-- is skipped for that row and the FK RESTRICT still blocks the account
-- deletion -- refusing to proceed is safer than silently orphaning stats.
create or replace function reassign_players_to_foster_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_head_coach uuid;
begin
  for v_player in select id from player where parent_user_id = old.id loop
    select ca.user_id into v_head_coach
    from roster_entry re
    join team t on t.id = re.team_id
    join coach_assignment ca on ca.team_id = t.id and ca.role = 'primary'
    where re.player_id = v_player.id
    order by (t.season_status = 'in_season') desc, re.created_at desc
    limit 1;

    if v_head_coach is not null then
      update player
      set parent_user_id = v_head_coach,
          reveal_full_name = false,
          parent_attested_at = null,
          parent_attested_by = null
      where id = v_player.id;
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists foster_parent_fallback_before_user_delete on auth.users;
create trigger foster_parent_fallback_before_user_delete
  before delete on auth.users
  for each row
  execute function reassign_players_to_foster_parent();

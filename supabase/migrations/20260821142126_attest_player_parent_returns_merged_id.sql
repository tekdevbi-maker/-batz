-- Bug: attest_player_parent called merge_player_into_existing via
-- `perform`, discarding its return value. When the attesting parent
-- already has an existing player with the same name (e.g. this same real
-- kid claimed on an earlier season/team -- exactly what
-- merge_player_into_existing exists to dedupe), that function DELETES
-- p_player_id and repoints everything to the pre-existing player row.
-- The client, still holding the original (now-deleted) player id, then
-- navigates to player-onboarding.tsx with it -- whose final save
-- (updatePlayerSettings) silently affects zero rows against a row that
-- no longer exists, surfacing as "Update was not applied -- you may not
-- have permission to edit this player." Only ever reproduces for a
-- player who already had a claimed identity elsewhere, which is why it
-- was intermittent rather than affecting every unlock.
--
-- Fix: return the actual final player id (the merge target, or
-- p_player_id unchanged if no merge happened) so callers can use the
-- right id afterward. Return type is changing (void -> uuid), so this
-- needs a drop, not just create-or-replace.
drop function if exists attest_player_parent(uuid);

create or replace function attest_player_parent(p_player_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_final_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from player where id = p_player_id and parent_user_id = v_caller) then
    raise exception 'not_the_current_owner';
  end if;

  update player
  set parent_attested_at = now(), parent_attested_by = v_caller, is_coach_fallback = false, display_mode = 'real_name'
  where id = p_player_id;

  v_final_id := merge_player_into_existing(v_caller, p_player_id);
  return v_final_id;
end;
$$;

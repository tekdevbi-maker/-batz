-- attest_player_parent (the coach's "I'm the Parent" self-claim) was the
-- one real-claim path that never called merge_player_into_existing --
-- register_player, parent_claim_player, and respond_to_transfer_offer all
-- already dedupe by exact name match under the same parent at the moment
-- of a real claim (20260728210000), but attest just flipped
-- is_coach_fallback without checking for an existing player of the
-- caller's with the same name. That's exactly how the same real kid
-- (e.g. re-registered on a new season's team) ends up as two separate
-- `player` rows the moment a coach attests to being their parent on both.
create or replace function attest_player_parent(p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
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

  perform merge_player_into_existing(v_caller, p_player_id);
end;
$$;

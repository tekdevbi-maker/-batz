-- Two bugs from the previous migration, both causing every one of a
-- coach's fallback-held players to still show as "claimed" (not archived
-- when the season ends):
--
-- 1. attest_player_parent -- the RPC behind the "I'm the Parent" button on
--    a player a coach already owns (spec: logs the attestation "without
--    reassigning parent_user_id") -- never touched is_coach_fallback. A
--    coach attesting to their own kid (parent_user_id doesn't change, so
--    parent_claim_player/transfer_player_to_member never ran) left the
--    flag exactly as auto_claim_roster_entry set it: true, i.e. still
--    "unclaimed" as far as the archive filter was concerned.
--
-- 2. `alter table player add column is_coach_fallback boolean not null
--    default false` backfills every EXISTING row -- including years of
--    already-fallback-held players -- to false, since a bare ADD COLUMN
--    DEFAULT has no way to know which old rows were real claims. Only
--    brand-new auto-claims (via the updated RPC) were ever getting `true`.
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
  set parent_attested_at = now(), parent_attested_by = v_caller, is_coach_fallback = false
  where id = p_player_id;
end;
$$;

-- Backfill: the only reliable signal left, after the fact, that a player
-- was actually claimed for real (not just sitting under the fallback
-- coach owner) is parent_attested_at -- both attest_player_parent and, in
-- the past, parent_claim_player/transfer_player_to_member's own history
-- set/cleared it deliberately, while auto_claim_roster_entry never touches
-- it at all. Combined with "current owner is a coach on one of this
-- player's teams" (a real, non-coach parent's own registration never
-- matches this), this correctly recovers the fallback flag for every
-- pre-existing row without needing full claim history.
update player p
set is_coach_fallback = true
where p.parent_attested_at is null
  and exists (
    select 1
    from roster_entry re
    join coach_assignment ca on ca.team_id = re.team_id and ca.user_id = p.parent_user_id
    where re.player_id = p.id
  );

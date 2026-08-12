-- 20260812110000_attest_self_approved_claims.sql only fixed the RPCs going
-- forward -- any player that was ALREADY unlocked by a coach claiming/
-- accepting for themselves is still stuck with parent_attested_at null,
-- which is exactly what hides the Settings link for a coach-owner (see
-- app/app/player/[playerId]/index.tsx). Backfill: attest any player whose
-- current owner is also a coach on that player's roster team and who has
-- never been attested.
update player p
set parent_attested_at = now(),
    parent_attested_by = p.parent_user_id
where p.parent_attested_at is null
  and exists (
    select 1
    from roster_entry re
    join coach_assignment ca on ca.team_id = re.team_id
    where re.player_id = p.id
      and ca.user_id = p.parent_user_id
  );

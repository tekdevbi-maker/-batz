-- Bug (#2/#2a): a parent who self-registered their own kid (register_player
-- -- e.g. via /join) never goes through any "unlock" step, so
-- parent_attested_at stays null forever. That's fine while they're just a
-- Follower (the Settings gate only requires attestation for a
-- coach-who-owns-the-player). But the moment a Head Coach promotes that
-- same parent to Assistant Coach, isCoachOwner flips true and the gate
-- retroactively demands an attestation that was never collected --
-- Settings silently disappears. Reproduced: attest-then-promote breaks,
-- promote-then-approve-claim works (because self-approval already attests,
-- see 20260812110000_attest_self_approved_claims.sql).
--
-- Fix going forward: promoting a Follower who already owns a real
-- (non-fallback) player on that team auto-attests those players too --
-- promotion is itself a deliberate Head-Coach action, same trust level as
-- approving a claim.
create or replace function promote_to_assistant_coach(
  p_team_id uuid,
  p_target_user_id uuid,
  p_first_name text,
  p_last_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_count int;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  if not exists (
    select 1 from team_membership where team_id = p_team_id and user_id = p_target_user_id
  ) then
    raise exception 'target_not_a_team_member';
  end if;

  if exists (select 1 from coach_assignment where team_id = p_team_id and user_id = p_target_user_id) then
    raise exception 'already_a_coach_on_this_team';
  end if;

  select count(*) into v_count from coach_assignment where team_id = p_team_id and role = 'assistant';
  if v_count >= 3 then
    raise exception 'assistant_coach_capacity_reached';
  end if;

  insert into coach_assignment (team_id, user_id, role, first_name, last_name)
  values (p_team_id, p_target_user_id, 'assistant', nullif(p_first_name, ''), nullif(p_last_name, ''))
  returning id into v_id;

  update player p
  set parent_attested_at = now(),
      parent_attested_by = p_target_user_id
  from roster_entry re
  where re.player_id = p.id
    and re.team_id = p_team_id
    and p.parent_user_id = p_target_user_id
    and coalesce(p.is_coach_fallback, false) = false
    and p.parent_attested_at is null;

  return v_id;
end;
$$;

-- Corrective cleanup: the original backfill (20260812120000) matched any
-- player whose owner is a coach on the player's team, without excluding
-- is_coach_fallback -- a coach's own default-held (never actually claimed)
-- roster spots also match "owner is a coach on this team" since fallback
-- ownership IS the head coach, so those got wrongly stamped as attested
-- too. Attestation is meaningless for an unclaimed fallback spot -- undo it.
update player
set parent_attested_at = null,
    parent_attested_by = null
where is_coach_fallback = true
  and parent_attested_at is not null;

-- Re-run the backfill properly scoped to real (non-fallback) ownership only,
-- in case any legitimate self-registered-then-promoted case is still
-- sitting broken today.
update player p
set parent_attested_at = now(),
    parent_attested_by = p.parent_user_id
where p.parent_attested_at is null
  and coalesce(p.is_coach_fallback, false) = false
  and exists (
    select 1
    from roster_entry re
    join coach_assignment ca on ca.team_id = re.team_id
    where re.player_id = p.id
      and ca.user_id = p.parent_user_id
  );

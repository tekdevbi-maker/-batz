-- Two more real issues found via live testing:
--
-- 1. A second parent entering an already-claimed uniform number hit
--    "duplicate key value violates unique constraint player_player_tag_key"
--    instead of a friendly "already claimed" message. PlayerTag is
--    deterministic from team/division/season/year/number, so two people
--    registering the same number always collide on the tag -- but
--    register_player() inserted the player row BEFORE checking whether the
--    spot was taken, so the low-level constraint fired first.
--
-- 2. The lookup for "is this number already claimed" couldn't actually see
--    already-claimed rows anyway: as SECURITY INVOKER, the function's
--    SELECT was subject to the caller's own RLS, and a stranger has no
--    policy granting visibility into another family's claimed roster_entry
--    (correctly so -- that's real privacy, not a bug). So the function
--    only ever recognized "unclaimed and matches" or "no row found" -- an
--    already-claimed number looked identical to a brand new one, and it
--    would have silently created a SECOND roster_entry for the same
--    uniform number.
--
-- Fix: SECURITY DEFINER, so the function can see the true claim state
-- regardless of the caller's own visibility, with the authorization logic
-- now enforced explicitly in the function body (auth.uid() is always used
-- for parent_user_id/team_membership -- there's no parameter letting a
-- caller register as anyone else) instead of relying on table RLS. Check
-- order is also fixed: verify claim status BEFORE creating the player row.
create or replace function register_player(
  p_team_id uuid,
  p_uniform_number int,
  p_first_name text,
  p_last_name text,
  p_player_tag text
) returns table (player_id uuid, roster_entry_id uuid, claimed_existing boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_player_id uuid;
  v_roster_entry_id uuid;
  v_existing_id uuid;
  v_existing_claimed boolean;
  v_claimed boolean := false;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.id, (re.player_id is not null) into v_existing_id, v_existing_claimed
  from roster_entry re
  where re.team_id = p_team_id and re.uniform_number = p_uniform_number
  limit 1;

  if v_existing_id is not null and v_existing_claimed then
    raise exception 'roster_spot_already_claimed';
  end if;

  insert into player (parent_user_id, first_name, last_name, player_tag)
  values (v_caller, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag)
  returning id into v_player_id;

  if v_existing_id is not null then
    update roster_entry
    set player_id = v_player_id
    where roster_entry.id = v_existing_id and roster_entry.player_id is null
    returning roster_entry.id into v_roster_entry_id;

    if v_roster_entry_id is null then
      raise exception 'roster_spot_already_claimed';
    end if;
    v_claimed := true;
  else
    insert into roster_entry (team_id, player_id, uniform_number, first_name, last_name)
    values (p_team_id, v_player_id, p_uniform_number, nullif(p_first_name, ''), nullif(p_last_name, ''))
    returning roster_entry.id into v_roster_entry_id;
  end if;

  insert into team_membership (team_id, user_id)
  values (p_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;

  return query select v_player_id, v_roster_entry_id, v_claimed;
end;
$$;

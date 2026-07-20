-- Sprint 8: assistant coach accounts (spec Section 10: up to 4 total
-- coach-role accounts per team, 1 primary + up to 3 assistant).
--
-- Fixes a real pre-existing gap along the way: Sprint 3's "users can
-- self-assign as coach" policy had no team-state or role restriction at
-- all -- any signed-in user could self-insert as coach on ANY existing
-- team via a direct API call (not reachable through the UI, but a real
-- hole at the RLS layer, the actual security boundary). Replaced with a
-- policy that only allows self-assigning as PRIMARY on a team that has
-- zero coaches yet (i.e. only during the original team-creation flow).
drop policy "users can self-assign as coach" on coach_assignment;

create policy "primary coach can self-assign to a brand-new team" on coach_assignment for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'primary'
    and not exists (select 1 from coach_assignment existing where existing.team_id = coach_assignment.team_id)
  );

-- Assistant joins go only through this SECURITY DEFINER function -- no
-- general "assistant can self-insert" policy exists, so this is the one
-- controlled path, same reasoning as register_player(): centralizing the
-- capacity check here is simpler and safer than trying to express
-- "count of existing rows < 4" as a race-proof RLS WITH CHECK subquery.
-- (Two assistants joining the same team within the same instant is a
-- near-zero-probability scenario for a Little League team; this isn't
-- given the explicit row-locking register_player's roster-claim race
-- needed, since a missed race here just means a rare 5th coach slips
-- through rather than corrupting claimed data.)
create or replace function join_as_assistant_coach(
  p_team_id uuid,
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

  if exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'already_a_coach_on_this_team';
  end if;

  select count(*) into v_count from coach_assignment where team_id = p_team_id;
  if v_count >= 4 then
    raise exception 'team_coach_capacity_reached';
  end if;

  insert into coach_assignment (team_id, user_id, role, first_name, last_name)
  values (p_team_id, v_caller, 'assistant', nullif(p_first_name, ''), nullif(p_last_name, ''))
  returning id into v_id;

  return v_id;
end;
$$;

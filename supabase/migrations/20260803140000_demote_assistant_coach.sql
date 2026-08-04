-- Head Coach needs a way to undo a promotion -- removes the target's
-- coach_assignment row (they fall back to whatever role their existing
-- team_membership implies: parent if they've claimed a player, follower
-- otherwise). Deliberately restricted to the Head Coach (role = 'primary')
-- specifically, not "any coach" like promote_to_assistant_coach is --
-- letting one assistant coach demote another (or the head coach) would be
-- a privilege-escalation problem.
create or replace function demote_assistant_coach(
  p_team_id uuid,
  p_target_user_id uuid
) returns void
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

  if not exists (
    select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller and role = 'primary'
  ) then
    raise exception 'not_the_head_coach';
  end if;

  delete from coach_assignment
  where team_id = p_team_id and user_id = p_target_user_id and role = 'assistant';

  if not found then
    raise exception 'target_not_an_assistant_coach';
  end if;
end;
$$;

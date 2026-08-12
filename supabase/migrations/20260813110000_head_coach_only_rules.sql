-- Three Head-Coach-only rules:
-- 1. Only the Head Coach (coach_assignment.role = 'primary') can update a
--    team's logo or mark its season complete -- tighten the existing "any
--    coach" update policy down to head-coach-only (or admin).
-- 2. Team Name is immutable once the team row exists -- enforced with a
--    trigger, not just RLS, so it holds regardless of which policy or
--    caller performs the update.
-- 3. (Same policy as #1 covers "Mark Season Complete", which is just a
--    season_status update on team.)

drop policy if exists "team coaches can update their team" on team;

create policy "head coach can update their team" on team for update
  to authenticated
  using (
    is_app_admin()
    or exists (
      select 1 from coach_assignment ca
      where ca.team_id = team.id and ca.user_id = auth.uid() and ca.role = 'primary'
    )
  );

create or replace function forbid_team_name_change() returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    raise exception 'team_name_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists forbid_team_name_change on team;
create trigger forbid_team_name_change
  before update on team
  for each row
  execute function forbid_team_name_change();

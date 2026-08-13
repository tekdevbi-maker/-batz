-- Adds a third visibility tier, "Only Me", for the new post-Agree
-- onboarding wizard's privacy step (Public | Private | Only Me). Private
-- already means "this player's own team can see it, nobody wider" (see
-- can_view_player's comment history); Only Me is strictly narrower --
-- nobody but the owning parent, not even teammates' coaches/parents.
alter table player drop constraint if exists player_visibility_scope_check;
alter table player add constraint player_visibility_scope_check
  check (visibility_scope in ('public', 'private', 'only_me'));

create or replace function can_view_player(target_player_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    target_player_id is null
    or exists (
      select 1 from player p
      where p.id = target_player_id
        and (
          p.parent_user_id = auth.uid()
          or p.visibility_scope = 'public'
          or (
            p.visibility_scope = 'private'
            and exists (
              select 1
              from roster_entry re
              where re.player_id = p.id
                and (
                  exists (select 1 from coach_assignment ca where ca.team_id = re.team_id and ca.user_id = auth.uid())
                  or exists (select 1 from team_membership tm where tm.team_id = re.team_id and tm.user_id = auth.uid())
                )
            )
          )
        )
    );
$$;

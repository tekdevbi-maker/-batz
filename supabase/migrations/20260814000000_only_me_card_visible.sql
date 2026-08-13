-- "Only Me" was fully blocking the player row via RLS (can_view_player
-- returned false for everyone but the owner), which made the whole
-- profile 404 as "Player not available" for anyone else. Per the actual
-- design, Only Me should behave like Public for the player's identity
-- (name/photo/card are still visible to everyone) -- only the STATS stay
-- hidden, and that's already handled client-side by the existing
-- PlayerCardStatsBack `locked` prop (same "*" masking used for a
-- coach-fallback player's stats), so no stat-line RLS change is needed
-- here, matching that existing precedent.
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
          or p.visibility_scope = 'only_me'
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

-- Sprint 6: the Section 7 transparency model. Until now reads were
-- team-scoped (deny unless coach/member). The spec's core design decision
-- inverts that: stats are visible to ANY signed-up user by default -- open
-- stats are the app's founding purpose (auditable all-star selections),
-- not an opt-in exception. The one carve-out is a parent setting their
-- player to Private, which restricts access to Coaches and Parents in
-- that player's League/Division for the CURRENT season -- live-evaluated,
-- so access shifts automatically as seasons end, with no manual
-- revocation (spec Section 7 "Visibility scope").
--
-- All helpers are SECURITY DEFINER (lesson from Sprint 4's policy
-- recursion): they read tables directly as owner, bypassing RLS, so
-- policies on player/roster_entry can reference each other's tables
-- without evaluating each other's policies in a cycle.

-- Can the current user view this player (and therefore their stats)?
--   - null player_id = unclaimed roster spot: open (no personal owner)
--   - public players: open to any signed-in user
--   - own players: always visible to the owning parent
--   - private players: visible only if the viewer has an in-season
--     coach_assignment or team_membership on a team in the same division
--     as one of the player's in-season teams. Division is the match key:
--     a division belongs to exactly one league, so same-division implies
--     same League/Division in the spec's phrasing.
create or replace function can_view_player(target_player_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    target_player_id is null
    or exists (
      select 1 from player p
      where p.id = target_player_id
        and (p.visibility_scope = 'public' or p.parent_user_id = auth.uid())
    )
    or exists (
      select 1
      from roster_entry re
      join team pt on pt.id = re.team_id and pt.season_status = 'in_season'
      join team vt on vt.division_id = pt.division_id and vt.season_status = 'in_season'
      where re.player_id = target_player_id
        and (
          exists (select 1 from coach_assignment ca where ca.team_id = vt.id and ca.user_id = auth.uid())
          or exists (select 1 from team_membership tm where tm.team_id = vt.id and tm.user_id = auth.uid())
        )
    );
$$;

create or replace function can_view_stat_line(target_roster_entry_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select can_view_player((select re.player_id from roster_entry re where re.id = target_roster_entry_id));
$$;

-- player: the Sprint 4 team-scoped read is superseded -- current-season
-- teammates/coaches are covered by the division check inside
-- can_view_player, and an ENDED season's coach deliberately loses access
-- to a Private player's identity (they fall back to seeing the computed
-- default tag), which is exactly the live-evaluated behavior the spec
-- describes. Own-team roster/game/stat ROWS stay accessible via the
-- existing team-scoped policies (team history integrity, Section 4) --
-- only the player identity row is gated here.
drop policy "team coaches and members can read rostered players" on player;

create policy "signed-in users can read viewable players" on player for select
  to authenticated
  using (can_view_player(id));

create policy "signed-in users can read viewable roster entries" on roster_entry for select
  to authenticated
  using (can_view_player(player_id));

-- Game rows themselves (date/opponent/number) carry no player data.
create policy "signed-in users can read games" on game for select
  to authenticated
  using (true);

create policy "signed-in users can read viewable stat lines" on game_batting_stat for select
  to authenticated
  using (can_view_stat_line(roster_entry_id));

-- Sprint 4: parent claim flow (spec Section 4).

-- Created when a parent claims a RosterEntry -- grants full read access to
-- that team (spec Section 2), not just their own kid's stats.
create table team_membership (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references team (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table team_membership enable row level security;

create policy "members and team coaches can read team_membership" on team_membership for select
  to authenticated
  using (
    is_app_admin()
    or user_id = auth.uid()
    or exists (select 1 from coach_assignment ca where ca.team_id = team_membership.team_id and ca.user_id = auth.uid())
  );

create policy "parents can self-claim team membership" on team_membership for insert
  to authenticated
  with check (user_id = auth.uid());

-- Parents (via team_membership) get the same read access to their team's
-- roster/games/stats that coaches already have (Sprint 3) -- these are
-- ADDITIONAL permissive policies, not replacements; Postgres RLS ORs
-- multiple policies for the same command together.
create policy "team members can read roster" on roster_entry for select
  to authenticated
  using (exists (select 1 from team_membership tm where tm.team_id = roster_entry.team_id and tm.user_id = auth.uid()));

create policy "team members can read games" on game for select
  to authenticated
  using (exists (select 1 from team_membership tm where tm.team_id = game.team_id and tm.user_id = auth.uid()));

create policy "team members can read game stats" on game_batting_stat for select
  to authenticated
  using (
    exists (
      select 1 from game g
      join team_membership tm on tm.team_id = g.team_id
      where g.id = game_batting_stat.game_id and tm.user_id = auth.uid()
    )
  );

-- A parent claiming an unclaimed roster_entry updates its player_id from
-- null to a player they own. USING restricts eligible rows to currently-
-- unclaimed ones, so a second parent can never claim an already-claimed
-- spot (spec Section 4: "first parent/guardian to register wins") -- this
-- is enforced here at the database level, not just in application code.
create policy "parents can claim an unclaimed roster entry" on roster_entry for update
  to authenticated
  using (player_id is null)
  with check (exists (select 1 from player p where p.id = roster_entry.player_id and p.parent_user_id = auth.uid()));

-- A parent registering before any game import exists creates a brand new
-- roster_entry directly (spec Section 2: "created either by a parent's
-- registration or ... the first game import"), linked to a player they own.
create policy "parents can create a roster entry for their own player" on roster_entry for insert
  to authenticated
  with check (exists (select 1 from player p where p.id = roster_entry.player_id and p.parent_user_id = auth.uid()));

-- player: broad Public/Private visibility (spec Section 7) is Sprint 6
-- work. Until then this stays as restricted as roster_entry -- readable by
-- the owning parent or the team's coaches/parents, not "any signed-up
-- user" yet, even though the column itself already defaults to 'public'.
alter table player enable row level security;

create policy "owning parent can read their player" on player for select
  to authenticated
  using (parent_user_id = auth.uid());

create policy "team coaches and members can read rostered players" on player for select
  to authenticated
  using (
    exists (
      select 1 from roster_entry re
      left join coach_assignment ca on ca.team_id = re.team_id and ca.user_id = auth.uid()
      left join team_membership tm on tm.team_id = re.team_id and tm.user_id = auth.uid()
      where re.player_id = player.id and (ca.user_id is not null or tm.user_id is not null)
    )
  );

create policy "parents can create their own player" on player for insert
  to authenticated
  with check (parent_user_id = auth.uid());

create policy "parents can update their own player" on player for update
  to authenticated
  using (parent_user_id = auth.uid());

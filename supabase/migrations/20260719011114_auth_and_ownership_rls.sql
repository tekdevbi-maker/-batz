-- Sprint 3: auth + Team creation + League/Division admin.
--
-- This adds basic OWNERSHIP rls (a coach can manage the team(s) they're
-- assigned to; the one v1 global admin can manage League/Division) -- not
-- to be confused with Sprint 6's much more involved Public/Private player
-- visibility model (spec Section 7), which is a separate, later concern.

-- v1 has exactly one global League Admin (the app's builder). There's no
-- self-serve way to become an admin; bootstrapped once via the service_role
-- key after the builder signs up through the app (see scripts/bootstrap-admin.ts).
create table app_admin (
  user_id uuid primary key references auth.users (id)
);

alter table app_admin enable row level security;

create policy "users can check their own admin status" on app_admin for select
  using (user_id = auth.uid());

create or replace function is_app_admin() returns boolean
language sql stable
as $$
  select exists (select 1 from app_admin where user_id = auth.uid());
$$;

-- Links a coach account to a Team (spec Section 2). v1 only wires up
-- self-registration as primary coach; the up-to-3-assistant-coach flow is
-- Sprint 8 work, so no capacity/role enforcement here yet.
create table coach_assignment (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references team (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  role text not null default 'primary' check (role in ('primary', 'assistant')),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table coach_assignment enable row level security;

create policy "authenticated can read coach assignments" on coach_assignment for select
  to authenticated
  using (true);

create policy "users can self-assign as coach" on coach_assignment for insert
  to authenticated
  with check (user_id = auth.uid());

-- league: organizational metadata, not sensitive -- readable by any signed
-- in user (needed for registration-form dropdowns). Self-serve creation of
-- a new League (spec Section 5's "type a new name" path) is always held
-- pending; only the admin can insert an already-verified League or flip a
-- pending one to verified.
create policy "authenticated can read leagues" on league for select
  to authenticated
  using (true);

create policy "authenticated can propose a new league (pending)" on league for insert
  to authenticated
  with check (verification_status = 'pending');

create policy "admin can create leagues" on league for insert
  to authenticated
  with check (is_app_admin());

create policy "admin can update leagues" on league for update
  to authenticated
  using (is_app_admin());

create policy "admin can delete leagues" on league for delete
  to authenticated
  using (is_app_admin());

-- division: admin-curated in the common case, but spec Section 5 only gives
-- League a "type a new name" fallback, not Division -- which creates a
-- chicken-and-egg problem for a brand-new League (no divisions exist under
-- it yet). Divisions aren't gated by the same verification concern leagues
-- are (there's no equivalent "Division verification" anywhere in the spec),
-- so this allows any authenticated user to create one, same as League's
-- self-serve path minus the pending-hold.
create policy "authenticated can read divisions" on division for select
  to authenticated
  using (true);

create policy "authenticated can create divisions" on division for insert
  to authenticated
  with check (true);

create policy "admin can update divisions" on division for update
  to authenticated
  using (is_app_admin());

create policy "admin can delete divisions" on division for delete
  to authenticated
  using (is_app_admin());

-- team: names aren't sensitive (matches the app's open-by-default stats
-- philosophy, spec Section 7) so broad read access is fine. Creation
-- happens as part of coach registration; only the team's own coaches (or
-- the admin) can modify it afterward.
create policy "authenticated can read teams" on team for select
  to authenticated
  using (true);

create policy "authenticated can create a team" on team for insert
  to authenticated
  with check (true);

create policy "team coaches can update their team" on team for update
  to authenticated
  using (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = team.id and ca.user_id = auth.uid())
  );

create policy "admin can delete teams" on team for delete
  to authenticated
  using (is_app_admin());

-- roster_entry / game / game_batting_stat hold real per-player data (spec
-- Section 3a/7 care a lot about not over-exposing this before the
-- PlayerTag/pseudonym layer exists in Sprint 6), so -- unlike league/team --
-- these stay restricted to the owning team's coaches rather than opened to
-- all authenticated users.
create policy "team coaches can read roster" on roster_entry for select
  to authenticated
  using (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = roster_entry.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can create roster entries" on roster_entry for insert
  to authenticated
  with check (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = roster_entry.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can update roster entries" on roster_entry for update
  to authenticated
  using (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = roster_entry.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can read games" on game for select
  to authenticated
  using (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = game.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can create games" on game for insert
  to authenticated
  with check (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = game.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can delete games" on game for delete
  to authenticated
  using (
    is_app_admin()
    or exists (select 1 from coach_assignment ca where ca.team_id = game.team_id and ca.user_id = auth.uid())
  );

create policy "team coaches can read game stats" on game_batting_stat for select
  to authenticated
  using (
    is_app_admin()
    or exists (
      select 1 from game g
      join coach_assignment ca on ca.team_id = g.team_id
      where g.id = game_batting_stat.game_id and ca.user_id = auth.uid()
    )
  );

create policy "team coaches can create game stats" on game_batting_stat for insert
  to authenticated
  with check (
    is_app_admin()
    or exists (
      select 1 from game g
      join coach_assignment ca on ca.team_id = g.team_id
      where g.id = game_batting_stat.game_id and ca.user_id = auth.uid()
    )
  );

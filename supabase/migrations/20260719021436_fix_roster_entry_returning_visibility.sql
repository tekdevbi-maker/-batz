-- The real bug (found after extensive live diagnosis, which also left the
-- schema in a temporary ad-hoc debugging state -- this migration restores
-- and corrects it): claiming or creating a roster_entry via UPDATE/INSERT
-- with RETURNING (which supabase-js always uses by default) requires the
-- resulting row to satisfy a SELECT policy, or Postgres reports "new row
-- violates row-level security policy" even though the write itself would
-- have succeeded. Once a roster_entry is claimed, it's no longer covered
-- by "unclaimed" visibility, and the claiming parent doesn't have a
-- team_membership row yet (that's created in a later step of the same
-- register_player() transaction) -- so no existing SELECT policy covered
-- it. Fix: a parent can always read roster_entry rows for players they own.

-- Clean up diagnostic artifacts from live debugging.
drop function if exists whoami();
drop function if exists whatrole();
drop function if exists test_claim(uuid, uuid);

alter table player enable row level security;

create or replace function owns_player(target_player_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from player where id = target_player_id and parent_user_id = auth.uid());
$$;

drop policy if exists "team coaches can update roster entries" on roster_entry;
create policy "team coaches can update roster entries" on roster_entry for update
  to authenticated
  using (is_app_admin() or exists (select 1 from coach_assignment ca where ca.team_id = roster_entry.team_id and ca.user_id = auth.uid()));

drop policy if exists "parents can claim an unclaimed roster entry" on roster_entry;
create policy "parents can claim an unclaimed roster entry" on roster_entry for update
  to authenticated
  using (player_id is null)
  with check (owns_player(player_id));

create policy "parents can read their own player's roster entry" on roster_entry for select
  to authenticated
  using (owns_player(player_id));

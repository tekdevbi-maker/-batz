-- roster_entry's claim/insert policies checked player ownership via a plain
-- EXISTS subquery against `player`. But player's own SELECT policy queries
-- back into roster_entry (to see if the caller coaches/parents the team a
-- player is rostered on) -- so evaluating one policy triggered evaluating
-- the other, which triggered the first again: "infinite recursion detected
-- in policy for relation roster_entry". Same fix as is_app_admin(): a
-- SECURITY DEFINER function reads player directly, bypassing its RLS
-- (and thus the cycle) instead of going through the policy-protected table.
create or replace function owns_player(target_player_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from player where id = target_player_id and parent_user_id = auth.uid());
$$;

drop policy "parents can claim an unclaimed roster entry" on roster_entry;
create policy "parents can claim an unclaimed roster entry" on roster_entry for update
  to authenticated
  using (player_id is null)
  with check (owns_player(player_id));

drop policy "parents can create a roster entry for their own player" on roster_entry;
create policy "parents can create a roster entry for their own player" on roster_entry for insert
  to authenticated
  with check (owns_player(player_id));

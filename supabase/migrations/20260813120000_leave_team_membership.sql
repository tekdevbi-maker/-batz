-- Team Home's new "Unfollow Team" option (non-coach Menu) needs to delete
-- the caller's own team_membership row -- no delete policy existed for
-- this table before (rows were only ever created via self-claim, never
-- removed).
create policy "users can leave a team" on team_membership for delete
  to authenticated
  using (user_id = auth.uid());

-- User Settings "Delete Account" (pending item #3). Every FK to
-- auth.users in this schema defaults to RESTRICT, so a raw
-- auth.admin.deleteUser() call would just fail with a constraint
-- violation. The one exception is player.parent_user_id, which already
-- has a BEFORE DELETE trigger (foster_parent_fallback_before_user_delete,
-- see 20260728170000) that reassigns every player the departing user owns
-- back to that player's current team Head Coach -- exactly the "reverts
-- back to the Head Coach" behavior the account-deletion popup promises,
-- and it already runs automatically on any auth.users delete regardless
-- of caller. This RPC clears every OTHER FK reference so the delete can
-- actually succeed, and is called by the delete-own-account Edge Function
-- (which holds the service-role key needed to delete the auth.users row
-- itself) immediately before that delete.
create or replace function prepare_account_for_deletion() returns void
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

  -- Deleting a Head Coach of a still-active team would leave that team
  -- headless with no path to a new one -- refuse rather than silently
  -- orphan it. (An ended-season team's coach_assignment is fine to drop.)
  if exists (
    select 1
    from coach_assignment ca
    join team t on t.id = ca.team_id
    where ca.user_id = v_caller and ca.role = 'primary' and t.season_status = 'in_season'
  ) then
    raise exception 'is_head_coach_of_active_team';
  end if;

  delete from team_membership where user_id = v_caller;
  delete from coach_assignment where user_id = v_caller;
  delete from follow where follower_user_id = v_caller;
  delete from activity_feed_like where user_id = v_caller;
  delete from block_or_report where reporter_user_id = v_caller or target_user_id = v_caller;
  delete from customer_care_request where requester_user_id = v_caller;
  delete from player_claim_request where requested_by = v_caller;
  update player_claim_request set decided_by = null where decided_by = v_caller;
  update player_claim_request set offered_by = null where offered_by = v_caller;
  update league set admin_user_id = null where admin_user_id = v_caller;
  delete from app_admin where user_id = v_caller;
end;
$$;

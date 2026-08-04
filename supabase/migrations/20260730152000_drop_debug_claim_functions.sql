-- Cleanup: drop the temporary debug helpers added while diagnosing why
-- Team Members' "Pending Claim Requests" list wasn't showing up. The
-- underlying request row and RLS/RPC logic were confirmed correct; the
-- issue was a silently-swallowed client error (fixed in members.tsx).
drop function if exists debug_list_all_claim_requests();
drop function if exists debug_list_coaches_for_team(uuid);
drop function if exists debug_list_pending_no_auth(uuid);

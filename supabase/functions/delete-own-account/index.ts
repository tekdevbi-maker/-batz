// User Settings "Delete Account". Only place besides admin-impersonate
// that touches the service role key -- deleting an auth.users row requires
// the Admin API, which the app's anon-key client can never call directly.
//
// Flow: verify the caller's own JWT -> call prepare_account_for_deletion()
// AS the caller (so its internal auth.uid() resolves correctly and RLS/the
// head-coach-of-active-team guard apply) to clear every other FK reference
// -> delete the auth.users row itself via the Admin API, which fires the
// existing foster_parent_fallback_before_user_delete trigger to reassign
// the caller's owned players back to their team's Head Coach.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace("Bearer ", "");
  if (!callerToken) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401 });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const {
    data: { user: callerUser },
    error: callerError,
  } = await serviceClient.auth.getUser(callerToken);
  if (callerError || !callerUser) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401 });
  }

  // Call the cleanup RPC as the caller (not the service client) so its
  // auth.uid() is the caller's, not null.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { error: prepError } = await callerClient.rpc("prepare_account_for_deletion");
  if (prepError) {
    if (prepError.message?.includes("is_head_coach_of_active_team")) {
      return new Response(
        JSON.stringify({
          error: "is_head_coach_of_active_team",
          detail: "You're the Head Coach of a team that's still in season. End that team's season or hand off Head Coach before deleting your account.",
        }),
        { status: 409 }
      );
    }
    return new Response(JSON.stringify({ error: "cleanup_failed", detail: prepError.message }), { status: 500 });
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(callerUser.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: "delete_failed", detail: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});

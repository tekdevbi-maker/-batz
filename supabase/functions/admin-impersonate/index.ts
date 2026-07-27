// Admin impersonation: mints a real session for a target user so an
// admin can see exactly what that user sees (RLS-scoped) while
// debugging a report. Only this function ever touches the service role
// key -- it's never shipped in the app.
//
// Flow: verify the caller's own JWT identifies an app_admin -> look up
// the target user by email via the Admin API -> generate a magiclink and
// immediately redeem it server-side (verifyOtp) to get a real
// access/refresh token pair -> log the event -> return the session to
// the caller. The app then calls supabase.auth.setSession() with that
// pair, after stashing its own admin session so "Return to Admin" can
// restore it without a re-login.
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

  const { targetEmail } = await req.json().catch(() => ({ targetEmail: null }));
  if (!targetEmail || typeof targetEmail !== "string") {
    return new Response(JSON.stringify({ error: "missing_target_email" }), { status: 400 });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Identify the caller from their own JWT (service client bypasses RLS,
  // but getUser still validates the token signature/expiry).
  const {
    data: { user: callerUser },
    error: callerError,
  } = await serviceClient.auth.getUser(callerToken);
  if (callerError || !callerUser) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401 });
  }

  const { data: adminRow } = await serviceClient
    .from("app_admin")
    .select("user_id")
    .eq("user_id", callerUser.id)
    .maybeSingle();
  if (!adminRow) {
    return new Response(JSON.stringify({ error: "not_an_admin" }), { status: 403 });
  }

  if (targetEmail.toLowerCase() === (callerUser.email ?? "").toLowerCase()) {
    return new Response(JSON.stringify({ error: "cannot_impersonate_self" }), { status: 400 });
  }

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });
  if (linkError || !linkData) {
    return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });
  }

  // Redeem the magiclink immediately, server-side, using an anon-key
  // client -- this is what actually produces a real access/refresh token
  // pair, rather than just a clickable link.
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: sessionData, error: verifyError } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError || !sessionData.session) {
    return new Response(
      JSON.stringify({ error: "could_not_create_session", detail: verifyError?.message ?? "no_session" }),
      { status: 500 }
    );
  }

  await serviceClient.from("admin_impersonation_log").insert({
    admin_user_id: callerUser.id,
    target_user_id: sessionData.session.user.id,
    target_email: targetEmail,
  });

  return new Response(
    JSON.stringify({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      email: sessionData.session.user.email,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

// Gap #1's passive confirmatory email: fired right after a parent's
// attest_player_parent() call succeeds (Agree on the Verification
// Notice, or a coach's own "Unlock Player"). Not a blocking step -- the
// consent itself already took effect; this is the "Plus" record: a
// paper trail plus a window to flag it if it wasn't really them. The
// caller is best-effort about this (see attestPlayerParent in
// claimRepository.ts) -- a failed send here never undoes the consent
// that already happened.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDRESS = Deno.env.get("CONSENT_EMAIL_FROM") ?? "noreply@brain-spell.com";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") ?? "atbatz@brain-spell.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace("Bearer ", "");
  if (!callerToken) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: CORS_HEADERS });
  }

  let playerName: string;
  try {
    const body = await req.json();
    playerName = String(body.playerName ?? "").trim();
    if (!playerName) throw new Error("missing playerName");
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const {
    data: { user: callerUser },
    error: callerError,
  } = await supabase.auth.getUser(callerToken);
  if (callerError || !callerUser?.email) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: CORS_HEADERS });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `@Batz <${FROM_ADDRESS}>`,
      to: [callerUser.email],
      subject: "You confirmed a player profile on @Batz",
      html:
        `<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Helvetica,Arial,sans-serif;background-color:#ffffff;">` +
        `<h1 style="color:#1d4ed8;font-size:22px;font-weight:700;margin:0 0 24px;">@Batz</h1>` +
        `<p style="color:#12224a;font-size:16px;line-height:24px;margin:0 0 16px;">` +
        `You just confirmed you're the parent/guardian of <strong>${escapeHtml(playerName)}</strong> on @Batz.</p>` +
        `<p style="color:#4c5b7d;font-size:14px;line-height:22px;margin:0 0 16px;">` +
        `If this wasn't you, contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1d4ed8;">${SUPPORT_EMAIL}</a> ` +
        `within 48 hours and we'll reverse it.</p>` +
        `<p style="color:#8993ac;font-size:13px;line-height:20px;margin:0;">` +
        `This is an automated confirmation -- no action is needed if this was you.</p>` +
        `</div>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return new Response(JSON.stringify({ error: "send_failed", detail }), { status: 502, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

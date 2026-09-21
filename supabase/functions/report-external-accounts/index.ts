// Scheduled watchdog: emails a report of every @Batz auth account whose
// email is NOT on the brain-spell.com domain -- i.e. real external
// sign-ups and outside testers, as opposed to the seeded staff accounts.
//
// Invoked only by the pg_cron job installed from
// supabase/scripts/report_external_accounts_cron.sql, with the service-role
// key as the Bearer token (so the platform's verify_jwt gate passes) plus
// an x-report-secret header this function checks against REPORT_CRON_SECRET.
// There is no app-facing caller and no user JWT involved.
//
// Cadence is 8am / 12pm / 4pm / 8pm America/New_York. pg_cron only fires in
// UTC, so the job is scheduled at every UTC hour those could fall on across
// DST (00,01,12,13,16,17,20,21) and this function no-ops on the firings
// that aren't a wanted ET hour -- keeping the wall-clock times fixed
// year-round. Override the hours with REPORT_RUN_HOURS_ET.
//
// Delivery is via Resend (same account/key as send-attestation-confirmation).
// By design the function stays silent on runs with zero external accounts.
//   POST {"dryRun": true}  -> return JSON, send nothing, ignore the ET gate
//   POST {"force": true}   -> send now regardless of the current ET hour
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET = Deno.env.get("REPORT_CRON_SECRET") ?? "";
const FROM_ADDRESS = Deno.env.get("REPORT_EMAIL_FROM") ?? "noreply@brain-spell.com";
const RECIPIENTS = (Deno.env.get("REPORT_RECIPIENTS") ?? "atbatz@brain-spell.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EXCLUDED_DOMAIN = (Deno.env.get("REPORT_EXCLUDED_DOMAIN") ?? "brain-spell.com").toLowerCase();
const RUN_HOURS_ET = (Deno.env.get("REPORT_RUN_HOURS_ET") ?? "8,12,16,20")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n));

type SlimUser = { id: string; email: string; created_at: string };
type UsageRow = { event_type: string; is_guest: boolean; count: number };

const USAGE_WINDOW_DAYS = 5;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let dryRun = false;
  let force = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
    force = body?.force === true;
  } catch {
    // An empty body is the normal cron case.
  }

  // The platform has already validated the Bearer service-role JWT before
  // we run; this second gate keeps anyone holding only the anon/service
  // key from triggering mail.
  if (!CRON_SECRET || req.headers.get("x-report-secret") !== CRON_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  // Drop the DST off-by-one firings (see header). dryRun / force skip this.
  if (!dryRun && !force) {
    const nyHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
      10,
    );
    if (!RUN_HOURS_ET.includes(nyHour)) {
      return json({ ok: true, skipped: "outside_scheduled_hours", nyHourET: nyHour });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Page through every auth user (Admin API caps perPage at 1000).
  const all: SlimUser[] = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return json({ error: "list_users_failed", detail: error.message }, 502);
    }
    const batch = data.users ?? [];
    for (const u of batch) {
      all.push({ id: u.id, email: u.email ?? "", created_at: u.created_at ?? "" });
    }
    if (batch.length < perPage) break;
  }

  const external = all
    .filter((u) => {
      if (!u.email) return false;
      const at = u.email.lastIndexOf("@");
      const domain = at === -1 ? "" : u.email.slice(at + 1).toLowerCase();
      return domain !== EXCLUDED_DOMAIN;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  // Usage counts for the "Create A Player" / guest feature and the
  // "Download Card (PDF)" button (see lib/guestAnalytics.ts) -- the
  // guest_feature_event table has no SELECT policy for anon/authenticated
  // (see its migration), so this admin/service-role client is the only
  // way to read it back at all.
  const windowStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: usageRows, error: usageError } = await admin
    .from("guest_feature_event")
    .select("event_type, is_guest")
    .gte("created_at", windowStart);
  if (usageError) {
    return json({ error: "usage_query_failed", detail: usageError.message }, 502);
  }
  const usageCounts = new Map<string, number>();
  for (const row of usageRows ?? []) {
    const key = `${row.event_type}|${row.is_guest}`;
    usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
  }
  const usage: UsageRow[] = [...usageCounts.entries()]
    .map(([key, count]) => {
      const [event_type, isGuestStr] = key.split("|");
      return { event_type, is_guest: isGuestStr === "true", count };
    })
    .sort((a, b) => (a.event_type < b.event_type ? -1 : a.event_type > b.event_type ? 1 : Number(b.is_guest) - Number(a.is_guest)));

  const summary = {
    ok: true,
    checkedAt: new Date().toISOString(),
    totalAccounts: all.length,
    externalCount: external.length,
    excludedDomain: EXCLUDED_DOMAIN,
    external,
    usageWindowDays: USAGE_WINDOW_DAYS,
    usage,
  };

  if (dryRun) {
    return json({ ...summary, emailed: false, dryRun: true });
  }

  // Silent on empty runs, by design -- now also sends if there's any
  // feature-usage activity to report, not just new external accounts.
  if (external.length === 0 && usage.length === 0) {
    return json({ ...summary, emailed: false });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `@Batz Monitor <${FROM_ADDRESS}>`,
      to: RECIPIENTS,
      subject: `@Batz: ${external.length} non-${EXCLUDED_DOMAIN} account${external.length === 1 ? "" : "s"}, ${usage.length} usage row${usage.length === 1 ? "" : "s"}`,
      html: renderUsageHtml(usage) + renderHtml(external, all.length),
      text: renderUsageText(usage) + "\n\n" + renderText(external, all.length),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ ...summary, emailed: false, error: "send_failed", detail }, 502);
  }

  return json({ ...summary, emailed: true, recipients: RECIPIENTS });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderText(rows: SlimUser[], total: number): string {
  const lines = rows.map((u) => `- ${u.email}  |  ${formatDate(u.created_at)}  |  ${u.id}`);
  return [
    `${rows.length} of ${total} @Batz auth accounts are not on ${EXCLUDED_DOMAIN}, newest first.`,
    "",
    ...lines,
  ].join("\n");
}

function renderHtml(rows: SlimUser[], total: number): string {
  const cell = "padding:6px 12px;border-bottom:1px solid #e5e9f2;";
  const head =
    "text-align:left;padding:6px 12px;border-bottom:2px solid #12224a;" +
    "font-size:12px;color:#4c5b7d;text-transform:uppercase;letter-spacing:.04em;";
  const body = rows
    .map(
      (u) =>
        `<tr>` +
        `<td style="${cell}font-size:14px;color:#12224a;">${escapeHtml(u.email)}</td>` +
        `<td style="${cell}font-size:13px;color:#4c5b7d;white-space:nowrap;">${escapeHtml(formatDate(u.created_at))}</td>` +
        `<td style="${cell}font-size:12px;color:#8993ac;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(u.id)}</td>` +
        `</tr>`,
    )
    .join("");
  return (
    `<div style="max-width:640px;margin:0 auto;padding:0 24px 32px;font-family:-apple-system,Helvetica,Arial,sans-serif;background-color:#ffffff;">` +
    `<h2 style="color:#1d4ed8;font-size:16px;font-weight:700;margin:24px 0 8px;">Non-${escapeHtml(EXCLUDED_DOMAIN)} accounts</h2>` +
    `<p style="color:#12224a;font-size:15px;line-height:22px;margin:0 0 20px;">` +
    `<strong>${rows.length}</strong> of ${total} auth accounts are not on <code>${escapeHtml(EXCLUDED_DOMAIN)}</code>, newest first.</p>` +
    (rows.length === 0
      ? `<p style="color:#4c5b7d;font-size:14px;">No external accounts.</p>`
      : `<table style="border-collapse:collapse;width:100%;">` +
        `<thead><tr>` +
        `<th style="${head}">Email</th><th style="${head}">Created</th><th style="${head}">User ID</th>` +
        `</tr></thead>` +
        `<tbody>${body}</tbody>` +
        `</table>`) +
    `<p style="color:#8993ac;font-size:12px;line-height:18px;margin:20px 0 0;">` +
    `Automated 4x-daily check from the report-external-accounts Edge Function. ` +
    `Sent only when there's something to report.</p>` +
    `</div>`
  );
}

// "Create A Player" / guest feature + "Download Card (PDF)" usage, from
// lib/guestAnalytics.ts's anonymous guest_feature_event table. is_guest
// splits signed-in vs. guest/no-account usage for the same event type.
// Block-character bars since plain text has no real charting -- scaled to
// a fixed max width so the longest bar always fills it.
const TEXT_BAR_WIDTH = 20;

function renderUsageText(rows: UsageRow[]): string {
  const header = [`@Batz account watch`, "", `Card/guest-feature usage, last ${USAGE_WINDOW_DAYS} days:`, ""];
  if (rows.length === 0) {
    return [...header, "No events in this window."].join("\n");
  }
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const labelWidth = Math.max(...rows.map((r) => `${EVENT_SOURCE[r.event_type] ?? r.event_type} — ${r.event_type} (${r.is_guest ? "guest" : "signed in"})`.length));
  const lines = rows.map((r) => {
    const label = `${EVENT_SOURCE[r.event_type] ?? r.event_type} — ${r.event_type} (${r.is_guest ? "guest" : "signed in"})`.padEnd(labelWidth);
    const barLen = Math.max(1, Math.round((r.count / maxCount) * TEXT_BAR_WIDTH));
    return `${label}  ${"#".repeat(barLen)} ${r.count}`;
  });
  return [...header, ...lines].join("\n");
}

// Labels the two source files these events come from, per row, for the
// chart -- guestAnalytics.ts logs guest_players_viewed/local_player_created,
// CardDownloadButton.tsx logs card_pdf_downloaded.
const EVENT_SOURCE: Record<string, string> = {
  guest_players_viewed: "guestAnalytics",
  local_player_created: "guestAnalytics",
  card_pdf_downloaded: "CardDownloadButton",
};

function renderUsageHtml(rows: UsageRow[]): string {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  // Horizontal bars built from nested divs inside a table -- avoids SVG/
  // canvas, which many email clients (Outlook especially) don't render.
  const bars = rows
    .map((r) => {
      const pct = Math.max(4, Math.round((r.count / maxCount) * 100));
      const color = r.is_guest ? "#10b981" : "#1d4ed8";
      const label = `${EVENT_SOURCE[r.event_type] ?? r.event_type} — ${r.event_type} (${r.is_guest ? "guest" : "signed in"})`;
      return (
        `<tr>` +
        `<td style="padding:5px 10px 5px 0;font-size:13px;color:#12224a;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:5px 0;width:100%;">` +
        `<div style="background:#e5e9f2;border-radius:4px;overflow:hidden;">` +
        `<div style="background:${color};height:14px;width:${pct}%;"></div>` +
        `</div>` +
        `</td>` +
        `<td style="padding:5px 0 5px 10px;font-size:13px;color:#12224a;text-align:right;font-weight:600;">${r.count}</td>` +
        `</tr>`
      );
    })
    .join("");
  const chart =
    rows.length === 0
      ? `<p style="color:#4c5b7d;font-size:14px;">No events in this window.</p>`
      : `<table style="border-collapse:collapse;width:100%;">${bars}</table>`;
  return (
    `<div style="max-width:640px;margin:0 auto;padding:32px 24px 0;font-family:-apple-system,Helvetica,Arial,sans-serif;background-color:#ffffff;">` +
    `<h1 style="color:#1d4ed8;font-size:20px;font-weight:700;margin:0 0 8px;">@Batz account watch</h1>` +
    `<h2 style="color:#1d4ed8;font-size:16px;font-weight:700;margin:16px 0 8px;">Card/guest-feature usage</h2>` +
    `<p style="color:#12224a;font-size:14px;line-height:20px;margin:0 0 12px;">` +
    `"Create A Player" (guestAnalytics) and card PDF downloads (CardDownloadButton) over the last <strong>${USAGE_WINDOW_DAYS} days</strong>. ` +
    `<span style="color:#1d4ed8;">■</span> signed in &nbsp; <span style="color:#10b981;">■</span> guest.</p>` +
    chart +
    `</div>`
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

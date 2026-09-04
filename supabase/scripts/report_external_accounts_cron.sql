-- One-time operational setup for the "non-brain-spell.com accounts" email
-- report. Run this ONCE against the LINKED (hosted) database -- never in
-- local dev, since it installs a timer that POSTs to the deployed Edge
-- Function.
--
-- Easiest: Supabase Dashboard -> SQL Editor, paste this file, fill the two
-- placeholders, Run. (Or psql against the Dashboard's connection string:
--   Project Settings -> Database -> Connection string -> URI.)
--
-- Prerequisites
--   1. Deploy the function:
--        npx supabase functions deploy report-external-accounts
--   2. Give it a shared secret (any long random string):
--        npx supabase secrets set REPORT_CRON_SECRET=<random-hex>
--      RESEND_API_KEY is already set (shared with send-attestation-confirmation).
--   3. Fill in the two placeholders below before running:
--        <SERVICE_ROLE_KEY>   -> Project Settings -> API -> service_role key
--        <REPORT_CRON_SECRET> -> the exact value passed to `secrets set` above
--
-- Cadence: 8am / 12pm / 4pm / 8pm America/New_York. pg_cron only fires in
-- UTC, so the job is scheduled at every UTC hour those hit across DST
-- (00,01,12,13,16,17,20,21) and the Edge Function no-ops on the firings
-- that aren't a wanted ET hour (REPORT_RUN_HOURS_ET, default "8,12,16,20").
-- Recipient is the REPORT_RECIPIENTS env (default atbatz@brain-spell.com).
-- Re-run this file after changing the schedule; it drops and recreates the
-- job. To stop it:  select cron.unschedule('report-external-accounts');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stash the two values the job needs in Vault so they are not written into
-- cron.job.command in plaintext. Safe to re-run: skipped if already set
-- (change them later via vault.update_secret).
select vault.create_secret(
  '<SERVICE_ROLE_KEY>',
  'report_service_key',
  'Bearer token: report-external-accounts cron -> Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'report_service_key');

select vault.create_secret(
  '<REPORT_CRON_SECRET>',
  'report_cron_secret',
  'x-report-secret header for report-external-accounts'
)
where not exists (select 1 from vault.secrets where name = 'report_cron_secret');

-- Recreate the schedule.
select cron.unschedule('report-external-accounts')
where exists (select 1 from cron.job where jobname = 'report-external-accounts');

select cron.schedule(
  'report-external-accounts',
  '0 0,1,12,13,16,17,20,21 * * *',
  $CRON$
  select net.http_post(
    url := 'https://ritordpswejmdzyrvmng.supabase.co/functions/v1/report-external-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_service_key'),
      'x-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $CRON$
);

-- Verify: should list one active job.
select jobid, schedule, jobname, active from cron.job where jobname = 'report-external-accounts';

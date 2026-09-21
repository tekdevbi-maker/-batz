-- Anonymous usage counter for the fully-local "Create A Player" / guest
-- flow (app/guest-players.tsx, app/create-player.tsx). That feature is
-- deliberately 100% on-device otherwise -- no player name/photo/stats ever
-- reach Supabase -- so this table intentionally carries nothing but an
-- event type, a guest/signed-in flag, and a timestamp. No user id, no
-- player data, nothing identifying. Written to from the client with the
-- anon key (guests have no session at all), so RLS grants INSERT only --
-- no SELECT policy exists for anon/authenticated, meaning normal app
-- traffic can never read this back; checking counts means querying it
-- directly in the Supabase dashboard (which runs as postgres, bypassing
-- RLS) or via a service-role key.
create table guest_feature_event (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  is_guest boolean not null,
  created_at timestamptz not null default now()
);

alter table guest_feature_event enable row level security;

create policy "anyone can log a guest feature event" on guest_feature_event for insert
  to anon, authenticated
  with check (true);

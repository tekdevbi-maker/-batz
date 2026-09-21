import type { SupabaseClient } from "@supabase/supabase-js";

// Anonymous usage counter, originally for the fully-local "Create A
// Player" / guest feature but also used for the free "Download Card (PDF)"
// button on real player profiles (the is_guest flag distinguishes the two)
// -- see supabase/migrations/20260921180000_guest_feature_events.sql for
// what this actually stores (nothing but an event type, a guest flag, and
// a timestamp; no player data, no user id). Fire-and-forget by design: a
// failed log (e.g. offline) should never block or surface an error in the
// flow it's trying to measure.
export type GuestFeatureEventType = "guest_players_viewed" | "local_player_created" | "card_pdf_downloaded";

export function logGuestFeatureEvent(
  supabase: SupabaseClient,
  eventType: GuestFeatureEventType,
  isGuest: boolean
): void {
  supabase
    .from("guest_feature_event")
    .insert({ event_type: eventType, is_guest: isGuest })
    .then(
      () => {},
      () => {}
    );
}

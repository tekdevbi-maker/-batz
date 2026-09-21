import type { SupabaseClient } from "@supabase/supabase-js";

// Anonymous usage counter for the fully-local "Create A Player" / guest
// feature -- see supabase/migrations/20260921180000_guest_feature_events.sql
// for what this actually stores (nothing but an event type, a guest flag,
// and a timestamp; no player data, no user id). Fire-and-forget by design:
// a failed log (e.g. offline) should never block or surface an error in
// the guest flow it's trying to measure.
export type GuestFeatureEventType = "guest_players_viewed" | "local_player_created";

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

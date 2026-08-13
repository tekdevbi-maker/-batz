import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateEmail(supabase: SupabaseClient, email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}

export async function updateName(supabase: SupabaseClient, firstName: string, lastName: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } });
  if (error) throw error;
}

export class HeadCoachOfActiveTeamError extends Error {}

// Calls the delete-own-account Edge Function (the only place besides
// admin-impersonate that touches the service role key -- deleting an
// auth.users row needs the Admin API, which the app's anon-key client can
// never call directly). The function itself unlinks every player the
// caller owns (reassigned to that player's Head Coach, via the existing
// foster_parent_fallback_before_user_delete trigger) before removing the
// account.
export async function deleteMyAccount(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-own-account", { method: "POST" });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = await context?.json().catch(() => null);
    if (body?.error === "is_head_coach_of_active_team") {
      throw new HeadCoachOfActiveTeamError(body.detail ?? "You're the Head Coach of a team that's still in season.");
    }
    throw new Error(body?.detail ?? body?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
}

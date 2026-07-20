import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeamCoach {
  userId: string;
  role: "primary" | "assistant";
  firstName: string | null;
  lastName: string | null;
}

export async function listTeamCoaches(supabase: SupabaseClient, teamId: string): Promise<TeamCoach[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select("user_id, role, first_name, last_name")
    .eq("team_id", teamId)
    .order("role");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    userId: r.user_id,
    role: r.role,
    firstName: r.first_name,
    lastName: r.last_name,
  }));
}

export class CoachCapacityError extends Error {}
export class AlreadyCoachError extends Error {}

// spec Section 10: up to 4 total coach-role accounts per team (1 primary +
// up to 3 assistant). Delegates to join_as_assistant_coach() so the
// capacity check and insert happen together -- see the migration comment
// for why this is a controlled RPC rather than an open RLS policy.
export async function joinAsAssistantCoach(
  supabase: SupabaseClient,
  teamId: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const { data, error } = await supabase.rpc("join_as_assistant_coach", {
    p_team_id: teamId,
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) {
    if (error.message?.includes("team_coach_capacity_reached")) {
      throw new CoachCapacityError("This team already has the maximum of 4 coaches.");
    }
    if (error.message?.includes("already_a_coach_on_this_team")) {
      throw new AlreadyCoachError("You're already a coach on this team.");
    }
    throw error;
  }
  return data as string;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Whether the given user coaches this team at all (head or assistant) --
// drives whether a locked (coach-fallback) player's real name/stats show,
// since the lock is only lifted for coaching staff on that specific team.
export async function isCoachOnTeam(supabase: SupabaseClient, teamId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("coach_assignment")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// Head-Coach-only actions (logo upload, Mark Season Complete) gate on this
// instead of isCoachOnTeam -- an assistant coach is still "a coach" but not
// the one who owns these team-level decisions.
export async function isHeadCoachOnTeam(supabase: SupabaseClient, teamId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("coach_assignment")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("role", "primary")
    .maybeSingle();
  return !!data;
}

export interface CoachedTeam {
  id: string;
  name: string;
  divisionName: string;
  season: string;
  year: number;
  logoUrl: string | null;
}

const TEAM_COLUMNS = "id, name, season, year, season_status, logo_url, division:division_id(name)";

function byStatus(rows: any[], status: "in_season" | "ended"): CoachedTeam[] {
  return rows
    .map((row) => row.team)
    .filter((team) => team && team.season_status === status)
    .map((team) => ({
      id: team.id,
      name: team.name,
      divisionName: team.division?.name ?? "",
      season: team.season,
      year: team.year,
      logoUrl: team.logo_url ?? null,
    }));
}

function dedupeById(teams: CoachedTeam[]): CoachedTeam[] {
  const seen = new Set<string>();
  return teams.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

// Teams the signed-in user is HEAD Coach of (role = 'primary' only -- an
// assistant coach follows a team, they don't own it, so they show up under
// "Followed Teams" alongside claimed-parent members instead). Only
// in-season teams surface here by default (spec Section 6: "Only in-season
// teams appear on Home") -- listMyPreviousCoachedTeams below covers the
// ended ones (Previous Teams).
export async function listMyCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select(`team:team_id(${TEAM_COLUMNS})`)
    .eq("user_id", userId)
    .eq("role", "primary");
  if (error) throw error;
  return byStatus(data ?? [], "in_season");
}

// Teams the signed-in user follows without being Head Coach: a claimed
// parent (team_membership) or an assistant coach (coach_assignment with
// role = 'assistant').
export async function listMyMemberTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const [memberships, assistantAssignments] = await Promise.all([
    supabase.from("team_membership").select(`team:team_id(${TEAM_COLUMNS})`).eq("user_id", userId),
    supabase.from("coach_assignment").select(`team:team_id(${TEAM_COLUMNS})`).eq("user_id", userId).eq("role", "assistant"),
  ]);
  if (memberships.error) throw memberships.error;
  if (assistantAssignments.error) throw assistantAssignments.error;
  return dedupeById(byStatus([...(memberships.data ?? []), ...(assistantAssignments.data ?? [])], "in_season"));
}

// Teams the signed-in user coaches in ANY role (head or assistant) --
// unlike listMyCoachedTeams, used where the coaching duty itself matters
// more than head-coach ownership (e.g. shared-csv.tsx's "which team is
// this file for" picker: an assistant coach can import a game too).
export async function listAllMyCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select(`team:team_id(${TEAM_COLUMNS})`)
    .eq("user_id", userId);
  if (error) throw error;
  return byStatus(data ?? [], "in_season");
}

export async function listAllMyPreviousCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select(`team:team_id(${TEAM_COLUMNS})`)
    .eq("user_id", userId);
  if (error) throw error;
  return byStatus(data ?? [], "ended");
}

// Ended-season counterparts, backing Home's "Previous Teams" section.
export async function listMyPreviousCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select(`team:team_id(${TEAM_COLUMNS})`)
    .eq("user_id", userId)
    .eq("role", "primary");
  if (error) throw error;
  return byStatus(data ?? [], "ended");
}

export async function listMyPreviousMemberTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const [memberships, assistantAssignments] = await Promise.all([
    supabase.from("team_membership").select(`team:team_id(${TEAM_COLUMNS})`).eq("user_id", userId),
    supabase.from("coach_assignment").select(`team:team_id(${TEAM_COLUMNS})`).eq("user_id", userId).eq("role", "assistant"),
  ]);
  if (memberships.error) throw memberships.error;
  if (assistantAssignments.error) throw assistantAssignments.error;
  return dedupeById(byStatus([...(memberships.data ?? []), ...(assistantAssignments.data ?? [])], "ended"));
}

// Head-Coach-only (enforced inside the RPC itself, not just RLS). One-way
// in the UI (no "reopen" flow) -- ending a season is what moves a team
// from Home's Teams grid to Previous Teams and stops it counting toward
// the "only in-season teams" visibility rules used elsewhere. Also the
// COPPA data-retention trigger: any still-unclaimed player on this team
// gets permanently anonymized (see mark_season_ended in
// 20260814030000_season_end_anonymization.sql) as part of the same call.
export async function markSeasonEnded(supabase: SupabaseClient, teamId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_season_ended", { p_team_id: teamId });
  if (error) throw error;
}

// Non-coach Team Home's "Unfollow Team" -- removes the caller's own
// team_membership row AND unlinks any player they own on that specific
// team (handed back to the Head Coach as coach-fallback, same reset
// unlink_player does), all in one atomic RPC. Only meaningful for a plain
// follower/parent; coaches leave via a different flow entirely. Returns
// how many players were unlinked so the UI can tell the Fan what happened.
export async function leaveTeam(supabase: SupabaseClient, teamId: string): Promise<number> {
  const { data, error } = await supabase.rpc("leave_team_and_unlink_players", { p_team_id: teamId });
  if (error) throw error;
  return data ?? 0;
}

export type TeamMemberRole = "head_coach" | "assistant_coach" | "parent" | "follower";

export interface TeamMember {
  userId: string;
  email: string;
  displayName: string;
  role: TeamMemberRole;
  // Players actually claimed (real or attested) -- shown as "Parent of ...".
  claimedPlayerNames: string | null;
  // Coach-fallback/default-held roster spots -- unclaimed by any parent,
  // just the coach's default ownership. Shown as "Coach of ...", never
  // "Parent of ...".
  coachFallbackPlayerNames: string | null;
}

// Coach-only (RLS-equivalent check happens inside the get_team_members
// SECURITY DEFINER function, since PostgREST can't join auth.users
// directly). Backs the Team Members screen: promote-to-assistant-coach
// and the transfer-target picker both read from this list.
export async function getTeamMembers(supabase: SupabaseClient, teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc("get_team_members", { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    claimedPlayerNames: row.claimed_player_names,
    coachFallbackPlayerNames: row.coach_fallback_player_names,
  }));
}

export class AssistantCoachCapacityError extends Error {}

export async function promoteToAssistantCoach(
  supabase: SupabaseClient,
  teamId: string,
  targetUserId: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const { error } = await supabase.rpc("promote_to_assistant_coach", {
    p_team_id: teamId,
    p_target_user_id: targetUserId,
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) {
    if (error.message?.includes("assistant_coach_capacity_reached")) {
      throw new AssistantCoachCapacityError("This team already has 3 assistant coaches.");
    }
    throw error;
  }
}

export class NotHeadCoachError extends Error {}

// Head-Coach-only: undoes a promotion. The target keeps their existing
// team_membership (parent/follower), just loses the coach_assignment row.
export async function demoteAssistantCoach(
  supabase: SupabaseClient,
  teamId: string,
  targetUserId: string
): Promise<void> {
  const { error } = await supabase.rpc("demote_assistant_coach", {
    p_team_id: teamId,
    p_target_user_id: targetUserId,
  });
  if (error) {
    if (error.message?.includes("not_the_head_coach")) {
      throw new NotHeadCoachError("Only the Head Coach can demote an Assistant Coach.");
    }
    throw error;
  }
}

// Uploads to the "team-logos" Storage bucket at "{teamId}/logo.<ext>"
// (upsert: true, so re-uploading replaces the same object rather than
// accumulating orphans) and points team.logo_url at the public URL. RLS on
// storage.objects restricts the upload itself to a coach of that team (or
// an admin) -- see supabase/migrations/20260723181500_team_logo_storage.sql.
export async function uploadTeamLogo(
  supabase: SupabaseClient,
  teamId: string,
  localUri: string,
  contentType: string
): Promise<string> {
  const ext = contentType.split("/")[1] || "jpg";
  const path = `${teamId}/logo.${ext}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("team-logos")
    .upload(path, arrayBuffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("team-logos").getPublicUrl(path);
  // Cache-bust so a re-uploaded logo doesn't keep showing a stale cached
  // image at the same URL (RN's Image cache keys purely off the URI).
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("team").update({ logo_url: publicUrl }).eq("id", teamId);
  if (updateError) throw updateError;

  return publicUrl;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDefaultPlayerTag } from "./playerTag";

// Coach Register's first page ("Continue to Team Registration") needs to
// confirm an email isn't already taken WITHOUT creating an account --
// signUp() itself is the only thing that ever creates one, and it only
// runs on page 2's "Complete Registration". Callable with no session.
export async function isEmailAvailable(supabase: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("email_is_available", { p_email: email });
  if (error) throw error;
  return !!data;
}

export interface TeamJoinContext {
  teamId: string;
  teamName: string;
  season: string;
  year: number;
  divisionName: string;
  leagueName: string;
  leagueInitials: string;
  coachFirstName: string | null;
  coachLastName: string | null;
  teamLogoUrl: string | null;
}

// Pre-fill info for the parent join screen (spec Section 4 step 3:
// "Registration is pre-filled with the Coach's name, Team, Division,
// Season, Year, and League name").
export async function getTeamJoinContext(
  supabase: SupabaseClient,
  teamId: string
): Promise<TeamJoinContext> {
  const { data: team, error: teamError } = await supabase
    .from("team")
    .select("name, season, year, logo_url, division:division_id(name, league:league_id(name, initials))")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { data: coach } = await supabase
    .from("coach_assignment")
    .select("first_name, last_name")
    .eq("team_id", teamId)
    .eq("role", "primary")
    .maybeSingle();

  const division = team.division as any;
  const league = division?.league as any;

  return {
    teamId,
    teamName: team.name,
    season: team.season,
    year: team.year,
    divisionName: division?.name ?? "",
    leagueName: league?.name ?? "",
    leagueInitials: league?.initials ?? "",
    coachFirstName: coach?.first_name ?? null,
    coachLastName: coach?.last_name ?? null,
    teamLogoUrl: team.logo_url ?? null,
  };
}

export interface RegisterPlayerInput {
  teamId: string;
  parentUserId: string;
  firstName: string;
  lastName: string;
  uniformNumber: number;
  playerTag?: string;
}

export interface RegisterPlayerResult {
  playerId: string;
  rosterEntryId: string;
  claimedExisting: boolean;
}

export class RosterSpotAlreadyClaimedError extends Error {}

// Claims an existing unclaimed roster_entry (created by a prior game
// import, matched by uniform number -- the one field the parent is
// guaranteed to provide, unlike name) or creates a new one directly if
// none exists yet (spec Section 2/4). Also creates the player row and a
// team_membership granting the parent full read access to the team.
// Delegates to the register_player() Postgres function so the whole thing
// is one transaction -- a failure partway through (e.g. someone else just
// claimed the spot) rolls back the player row too, instead of leaving an
// orphan that then blocks retries via the unique PlayerTag constraint.
export async function registerPlayer(
  supabase: SupabaseClient,
  input: RegisterPlayerInput,
  tagContext: Pick<TeamJoinContext, "divisionName" | "teamName" | "season" | "year" | "leagueInitials">
): Promise<RegisterPlayerResult> {
  const playerTag =
    input.playerTag?.trim() ||
    generateDefaultPlayerTag({
      uniformNumber: input.uniformNumber,
      division: tagContext.divisionName,
      teamName: tagContext.teamName,
      season: tagContext.season,
      year: tagContext.year,
      leagueInitials: tagContext.leagueInitials,
    });

  const { data, error } = await supabase
    .rpc("register_player", {
      p_team_id: input.teamId,
      p_uniform_number: input.uniformNumber,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_player_tag: playerTag,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes("roster_spot_already_claimed")) {
      throw new RosterSpotAlreadyClaimedError(
        "This roster spot was just claimed by someone else. Please check the roster and try again."
      );
    }
    throw error;
  }

  const row = data as { player_id: string; roster_entry_id: string; claimed_existing: boolean };
  return { playerId: row.player_id, rosterEntryId: row.roster_entry_id, claimedExisting: row.claimed_existing };
}

export class NotACoachError extends Error {}
export class TeamAtCapacityError extends Error {}

// Follower join: adds the caller to the team's member list without
// claiming a player (spec: view-only Roster/Player Profile/leaderboard
// access, follow/unfollow is their only control).
export async function joinTeamAsFollower(
  supabase: SupabaseClient,
  teamId: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const { error } = await supabase.rpc("join_team_as_follower", {
    p_team_id: teamId,
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) {
    if (error.message?.includes("team_at_capacity")) {
      throw new TeamAtCapacityError("This team's 100-member limit has been reached.");
    }
    throw error;
  }
}

// Coach-only: OFFERS a roster spot to an existing team member -- the
// target must agree via respondToTransferOffer before ownership actually
// changes (COPPA-driven parental consent, replaces the old instant
// transfer_player_to_member). The target must already appear on the
// team's member list.
export async function offerPlayerTransfer(
  supabase: SupabaseClient,
  rosterEntryId: string,
  targetUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("offer_player_transfer", {
    p_roster_entry_id: rosterEntryId,
    p_target_user_id: targetUserId,
  });
  if (error) {
    if (error.message?.includes("not_a_coach_on_this_team")) {
      throw new NotACoachError("Only a coach on this team can transfer a player.");
    }
    throw error;
  }
  return data as string;
}

export interface PendingTransferOffer {
  requestId: string;
  playerId: string;
  displayName: string;
  teamName: string;
  playerName: string;
  coachName: string | null;
}

// Follower-facing: my own pending coach-initiated offers, across every
// team -- drives the consent popup, either surfaced from a Home
// notification or directly on the player's own card.
export async function listMyPendingTransferOffers(supabase: SupabaseClient): Promise<PendingTransferOffer[]> {
  const { data, error } = await supabase.rpc("list_my_pending_transfer_offers");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    requestId: r.request_id,
    playerId: r.player_id,
    displayName: r.display_name,
    teamName: r.team_name,
    playerName: [r.player_first_name, r.player_last_name].filter(Boolean).join(" ").trim() || r.display_name,
    coachName: [r.coach_first_name, r.coach_last_name].filter(Boolean).join(" ").trim() || null,
  }));
}

// The target's response to a coach-initiated offer -- agreeing is the one
// place a coach-offered transfer actually changes ownership.
export async function respondToTransferOffer(supabase: SupabaseClient, requestId: string, agree: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_transfer_offer", { p_request_id: requestId, p_agree: agree });
  if (error) {
    if (error.message?.includes("team_at_capacity")) {
      throw new TeamAtCapacityError("This team's 100-member limit has been reached.");
    }
    throw error;
  }
}

// Reverts a claimed player back to locked/coach-fallback status. Callable
// by the player's own current parent (self-service -- offered right in the
// same consent popup that unlocked them) or that team's Head Coach
// (unilateral).
export async function unlinkPlayer(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase.rpc("unlink_player", { p_player_id: playerId });
  if (error) throw error;
}

// "I am the parent for this player": logs the attestation and unlocks
// full parent-level Settings access for the coach on this specific
// player, without reassigning parent_user_id.
export async function attestPlayerParent(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase.rpc("attest_player_parent", { p_player_id: playerId });
  if (error) throw error;
}

export class AlreadyClaimedByParentError extends Error {}

// Self-service: any signed-in user can REQUEST to claim a roster spot
// themselves -- but only while the current owner is a coach on that team
// (auto-claimed-at-import default), never a real parent. Unlike the old
// immediate claim, this only records a pending request; the team's coach
// must approve it (approveClaimRequest) before ownership actually
// transfers and the roster spot's real name unlocks for this parent.
export async function requestPlayerClaim(supabase: SupabaseClient, rosterEntryId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("request_player_claim", { p_roster_entry_id: rosterEntryId });
  if (error) {
    if (error.message?.includes("already_claimed_by_a_parent")) {
      throw new AlreadyClaimedByParentError(
        "This player has already been claimed by a parent. Ask that team's coach if this was a mistake."
      );
    }
    throw error;
  }
  return data as string | null;
}

// "pending" | "approved" | "denied" | null (never requested, or the
// player was reassigned since -- e.g. season-end fallback reset).
export async function getMyClaimRequestStatus(supabase: SupabaseClient, rosterEntryId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_claim_request_status", { p_roster_entry_id: rosterEntryId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export interface PendingClaimRequest {
  requestId: string;
  rosterEntryId: string;
  playerId: string;
  uniformNumber: number;
  playerName: string;
  requestedBy: string;
  requesterEmail: string;
  requesterName: string;
  createdAt: string;
}

// Coach-facing approval queue for the Team Members screen.
export async function listPendingClaimRequests(supabase: SupabaseClient, teamId: string): Promise<PendingClaimRequest[]> {
  const { data, error } = await supabase.rpc("list_pending_claim_requests_for_team", { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    requestId: r.request_id,
    rosterEntryId: r.roster_entry_id,
    playerId: r.player_id,
    uniformNumber: r.uniform_number,
    playerName: r.player_name,
    requestedBy: r.requested_by,
    requesterEmail: r.requester_email,
    requesterName: r.requester_name,
    createdAt: r.created_at,
  }));
}

// Approving is where ownership actually transfers to the requesting parent.
export async function approveClaimRequest(supabase: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_player_claim_request", { p_request_id: requestId });
  if (error) {
    if (error.message?.includes("team_at_capacity")) {
      throw new TeamAtCapacityError("This team's 100-member limit has been reached.");
    }
    throw error;
  }
}

export async function denyClaimRequest(supabase: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await supabase.rpc("deny_player_claim_request", { p_request_id: requestId });
  if (error) throw error;
}

// Badge count for the Team Home "Team Members" tile.
export async function countPendingClaimRequests(supabase: SupabaseClient, teamId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_pending_claim_requests_for_team", { p_team_id: teamId });
  if (error) throw error;
  return (data as number) ?? 0;
}

// Badge counts for every team the caller coaches, in one call -- used on
// Home's "Teams You Coach" rows.
export async function listPendingClaimRequestCountsForCoach(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("list_pending_claim_request_counts_for_coach");
  if (error) throw error;
  const result: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    result[row.team_id] = Number(row.pending_count);
  }
  return result;
}

export interface NewlyAssignedPlayer {
  playerId: string;
  displayName: string;
}

// Home-facing: players newly transferred/approved to me that I haven't
// seen yet -- there's no push/email notification system in this app, so
// this in-app banner (cleared via acknowledgeNewPlayers) is the only way
// a parent finds out a coach handed them a player.
export async function listNewlyAssignedPlayers(supabase: SupabaseClient): Promise<NewlyAssignedPlayer[]> {
  const { data, error } = await supabase.rpc("list_newly_assigned_players");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ playerId: r.player_id, displayName: r.display_name }));
}

export async function acknowledgeNewPlayers(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("acknowledge_new_players");
  if (error) throw error;
}

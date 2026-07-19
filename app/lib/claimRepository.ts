import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDefaultPlayerTag } from "./playerTag";

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
    .select("name, season, year, division:division_id(name, league:league_id(name, initials))")
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

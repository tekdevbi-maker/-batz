import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBattingCounts, calculateStats, type BattingCounts, type CalculatedStats } from "./stats";
import { generateDefaultPlayerTag } from "./playerTag";
import { getTeamJoinContext, type TeamJoinContext } from "./claimRepository";

function toCounts(row: any): BattingCounts {
  return {
    ab: row.ab,
    h: row.h,
    singles: row.singles,
    doubles: row.doubles,
    triples: row.triples,
    hr: row.hr,
    rbi: row.rbi,
    bb: row.bb,
    hbp: row.hbp,
    sf: row.sf,
  };
}

// Display identity is the PlayerTag everywhere, including to the team's own
// coach (spec Section 7: real names are never shown by default, only once
// during claim). An unclaimed spot gets the same default-format tag a
// claimed one would start with, computed from team context.
function displayNameFor(
  playerTag: string | null | undefined,
  uniformNumber: number,
  context: Pick<TeamJoinContext, "divisionName" | "teamName" | "season" | "year" | "leagueInitials">
): string {
  return (
    playerTag ??
    generateDefaultPlayerTag({
      uniformNumber,
      division: context.divisionName,
      teamName: context.teamName,
      season: context.season,
      year: context.year,
      leagueInitials: context.leagueInitials,
    })
  );
}

export interface RosterSeasonStats {
  rosterEntryId: string;
  uniformNumber: number;
  displayName: string;
  counts: BattingCounts;
  stats: CalculatedStats;
}

// Season = every game recorded for this Team (a Team row is itself
// season-scoped, spec Section 2, so no date-range filtering is needed).
export async function getTeamRosterWithSeasonStats(
  supabase: SupabaseClient,
  teamId: string
): Promise<RosterSeasonStats[]> {
  const context = await getTeamJoinContext(supabase, teamId);

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_entry")
    .select("id, uniform_number, player:player_id(player_tag)")
    .eq("team_id", teamId)
    .order("uniform_number");
  if (rosterError) throw rosterError;

  const { data: gameRows, error: gameError } = await supabase.from("game").select("id").eq("team_id", teamId);
  if (gameError) throw gameError;
  const gameIds = (gameRows ?? []).map((g: { id: string }) => g.id);

  const statsByRosterEntry = new Map<string, BattingCounts[]>();
  if (gameIds.length > 0) {
    const { data: statRows, error: statError } = await supabase
      .from("game_batting_stat")
      .select("roster_entry_id, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf")
      .in("game_id", gameIds);
    if (statError) throw statError;
    for (const row of statRows ?? []) {
      const list = statsByRosterEntry.get(row.roster_entry_id) ?? [];
      list.push(toCounts(row));
      statsByRosterEntry.set(row.roster_entry_id, list);
    }
  }

  return (rosterRows ?? []).map((re: any) => {
    const counts = aggregateBattingCounts(statsByRosterEntry.get(re.id) ?? []);
    return {
      rosterEntryId: re.id,
      uniformNumber: re.uniform_number,
      displayName: displayNameFor(re.player?.player_tag, re.uniform_number, context),
      counts,
      stats: calculateStats(counts),
    };
  });
}

export interface GameSummary {
  id: string;
  gameNumber: number;
  gameDate: string;
  opponent: string | null;
  timeOfDay: string | null;
}

export interface BoxScoreLine {
  rosterEntryId: string;
  jerseyNumber: number | null;
  displayName: string;
  counts: BattingCounts;
  stats: CalculatedStats;
}

export async function listGamesForTeam(supabase: SupabaseClient, teamId: string): Promise<GameSummary[]> {
  const { data, error } = await supabase
    .from("game")
    .select("id, game_number, game_date, opponent, time_of_day")
    .eq("team_id", teamId)
    .order("game_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    id: g.id,
    gameNumber: g.game_number,
    gameDate: g.game_date,
    opponent: g.opponent,
    timeOfDay: g.time_of_day,
  }));
}

export async function getGameBoxScore(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ game: GameSummary; teamId: string; lines: BoxScoreLine[] }> {
  const { data: game, error: gameError } = await supabase
    .from("game")
    .select("id, team_id, game_number, game_date, opponent, time_of_day")
    .eq("id", gameId)
    .single();
  if (gameError) throw gameError;

  const context = await getTeamJoinContext(supabase, game.team_id);

  const { data: statRows, error: statError } = await supabase
    .from("game_batting_stat")
    .select(
      "roster_entry_id, jersey_number, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf, roster_entry:roster_entry_id(uniform_number, player:player_id(player_tag))"
    )
    .eq("game_id", gameId);
  if (statError) throw statError;

  const lines: BoxScoreLine[] = (statRows ?? []).map((row: any) => {
    const uniformNumber = row.roster_entry?.uniform_number ?? row.jersey_number ?? 0;
    const counts = toCounts(row);
    return {
      rosterEntryId: row.roster_entry_id,
      jerseyNumber: row.jersey_number,
      displayName: displayNameFor(row.roster_entry?.player?.player_tag, uniformNumber, context),
      counts,
      stats: calculateStats(counts),
    };
  });

  return {
    game: {
      id: game.id,
      gameNumber: game.game_number,
      gameDate: game.game_date,
      opponent: game.opponent,
      timeOfDay: game.time_of_day,
    },
    teamId: game.team_id,
    lines,
  };
}

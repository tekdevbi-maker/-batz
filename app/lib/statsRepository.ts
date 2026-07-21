import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBattingCounts, calculateStats, type BattingCounts, type CalculatedStats } from "./stats";
import { generateDefaultPlayerTag } from "./playerTag";
import { getTeamJoinContext, type TeamJoinContext } from "./claimRepository";
import { playerDisplayName } from "./playerRepository";

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

// Display identity per spec Section 7: real name only when the parent has
// explicitly revealed it, otherwise the PlayerTag. An unclaimed spot (or a
// Private player whose row RLS filtered out for this viewer) gets the same
// default-format tag a claim would start with, computed from team context.
function displayNameFor(
  player: { player_tag: string; first_name: string | null; last_name: string | null; reveal_full_name: boolean } | null | undefined,
  uniformNumber: number,
  context: Pick<TeamJoinContext, "divisionName" | "teamName" | "season" | "year" | "leagueInitials">
): string {
  if (player) {
    return playerDisplayName({
      playerTag: player.player_tag,
      firstName: player.first_name,
      lastName: player.last_name,
      revealFullName: player.reveal_full_name,
    });
  }
  return generateDefaultPlayerTag({
    uniformNumber,
    division: context.divisionName,
    teamName: context.teamName,
    season: context.season,
    year: context.year,
    leagueInitials: context.leagueInitials,
  });
}

export interface RosterSeasonStats {
  rosterEntryId: string;
  playerId: string | null;
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
    .select("id, uniform_number, player_id, player:player_id(player_tag, first_name, last_name, reveal_full_name)")
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
      // player_id is only non-null here if the viewer can actually see the
      // player row (RLS embeds return null otherwise), so linking to the
      // profile is gated the same way the identity is.
      playerId: re.player ? re.player_id : null,
      uniformNumber: re.uniform_number,
      displayName: displayNameFor(re.player, re.uniform_number, context),
      counts,
      stats: calculateStats(counts),
    };
  });
}

export interface DivisionLeaderboardEntry {
  rosterEntryId: string;
  playerId: string | null;
  teamName: string;
  uniformNumber: number;
  displayName: string;
  counts: BattingCounts;
  stats: CalculatedStats;
}

// League/Division-level leaderboard (spec Section 8): every player across
// every team in the SAME division AND the same season/year as the given
// team -- not other divisions (different age groups within the league)
// and not past seasons of this division. The Top-25 cap is a UI concern
// (applied by the screen after sorting), not this query -- this returns
// everyone RLS lets the viewer see, the same can_view_player()-gated
// visibility getTeamRosterWithSeasonStats already relies on, just spanning
// every team_id in the division instead of one.
export async function getDivisionLeaderboard(
  supabase: SupabaseClient,
  teamId: string
): Promise<DivisionLeaderboardEntry[]> {
  const { data: thisTeam, error: teamError } = await supabase
    .from("team")
    .select("division_id, season, year")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { data: teams, error: teamsError } = await supabase
    .from("team")
    .select("id, name, season, year, division:division_id(name, league:league_id(name, initials))")
    .eq("division_id", thisTeam.division_id)
    .eq("season", thisTeam.season)
    .eq("year", thisTeam.year);
  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((t: any) => t.id);
  const teamById = new Map(teams.map((t: any) => [t.id, t]));

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_entry")
    .select(
      "id, team_id, uniform_number, player_id, player:player_id(player_tag, first_name, last_name, reveal_full_name)"
    )
    .in("team_id", teamIds);
  if (rosterError) throw rosterError;

  const { data: gameRows, error: gameError } = await supabase.from("game").select("id").in("team_id", teamIds);
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
    const team = teamById.get(re.team_id);
    const division = team?.division;
    const league = division?.league;
    const context = {
      divisionName: division?.name ?? "",
      teamName: team?.name ?? "",
      season: team?.season ?? "",
      year: team?.year ?? 0,
      leagueInitials: league?.initials ?? "",
    };
    const counts = aggregateBattingCounts(statsByRosterEntry.get(re.id) ?? []);
    return {
      rosterEntryId: re.id,
      playerId: re.player ? re.player_id : null,
      teamName: team?.name ?? "",
      uniformNumber: re.uniform_number,
      displayName: displayNameFor(re.player, re.uniform_number, context),
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
  playerId: string | null;
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
      "roster_entry_id, jersey_number, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf, roster_entry:roster_entry_id(uniform_number, player_id, player:player_id(player_tag, first_name, last_name, reveal_full_name))"
    )
    .eq("game_id", gameId);
  if (statError) throw statError;

  const lines: BoxScoreLine[] = (statRows ?? []).map((row: any) => {
    const uniformNumber = row.roster_entry?.uniform_number ?? row.jersey_number ?? 0;
    const counts = toCounts(row);
    return {
      rosterEntryId: row.roster_entry_id,
      playerId: row.roster_entry?.player ? row.roster_entry.player_id : null,
      jerseyNumber: row.jersey_number,
      displayName: displayNameFor(row.roster_entry?.player, uniformNumber, context),
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

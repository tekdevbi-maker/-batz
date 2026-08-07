import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBattingCounts, calculateStats, type BattingCounts, type CalculatedStats } from "./stats";
import { generateDefaultPlayerTag, generateLockedPlayerTag } from "./playerTag";
import { getTeamJoinContext, type TeamJoinContext } from "./claimRepository";
import { playerDisplayName, type PlayerDisplayMode } from "./playerRepository";

const ZERO_COUNTS: BattingCounts = { ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, sf: 0 };

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

// Display identity. A locked (coach-fallback, unclaimed) player shows only
// "[TeamName] Player [UniformNumber]" to anyone who isn't coaching staff on
// that team -- COPPA-driven: name/uniform stay hidden from the general
// public until a parent actually claims the player. Coaching staff on the
// team see the real name (it came straight from an imported roster CSV, no
// pseudonym-worthy ambiguity there). Once claimed, the parent's own
// display_mode choice applies to everyone. A Private player whose row RLS
// filtered out entirely for this viewer (player is null) falls back to the
// same default-format tag a claim would start with, computed from team
// context.
function displayNameFor(
  player:
    | {
        player_tag: string;
        first_name: string | null;
        last_name: string | null;
        display_mode: "uniform" | "tag" | "real_name";
        is_coach_fallback: boolean;
      }
    | null
    | undefined,
  uniformNumber: number,
  context: Pick<TeamJoinContext, "divisionName" | "teamName" | "season" | "year" | "leagueInitials">,
  viewerIsCoach: boolean
): string {
  if (player) {
    if (player.is_coach_fallback) {
      if (viewerIsCoach) {
        const realName = [player.first_name, player.last_name].filter(Boolean).join(" ").trim();
        return realName || player.player_tag;
      }
      return generateLockedPlayerTag({ teamName: context.teamName, uniformNumber });
    }
    return playerDisplayName({
      playerTag: player.player_tag,
      firstName: player.first_name,
      lastName: player.last_name,
      displayMode: player.display_mode,
      uniformNumber,
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

// Locked players show blank (zeroed) stats to anyone but coaching staff on
// their team, regardless of what actually happened in the games.
function countsFor(player: { is_coach_fallback: boolean } | null | undefined, viewerIsCoach: boolean, counts: BattingCounts): BattingCounts {
  if (player?.is_coach_fallback && !viewerIsCoach) return ZERO_COUNTS;
  return counts;
}

export interface RosterSeasonStats {
  rosterEntryId: string;
  playerId: string | null;
  uniformNumber: number;
  displayName: string;
  visibilityScope: "public" | "private" | null;
  leaderboardOptOutTeam: boolean;
  isCoachFallback: boolean;
  photoUrl: string | null;
  // Raw real name and the parent's own display_mode choice -- the baseball
  // card (PlayerCard.tsx) only shows the real first/last name when
  // displayMode is "real_name" (same consent gate as everywhere else in
  // the app), falling back to `displayName` otherwise. Null/"uniform" for
  // a locked player, same photoUrl guard.
  firstName: string | null;
  lastName: string | null;
  displayMode: PlayerDisplayMode;
  counts: BattingCounts;
  stats: CalculatedStats;
}

// Season = every game recorded for this Team (a Team row is itself
// season-scoped, spec Section 2, so no date-range filtering is needed).
export async function getTeamRosterWithSeasonStats(
  supabase: SupabaseClient,
  teamId: string,
  viewerIsCoach: boolean
): Promise<RosterSeasonStats[]> {
  const context = await getTeamJoinContext(supabase, teamId);

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_entry")
    .select(
      "id, uniform_number, player_id, player:player_id(player_tag, first_name, last_name, display_mode, is_coach_fallback, visibility_scope, leaderboard_opt_out_team, photo_url)"
    )
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
    const rawCounts = aggregateBattingCounts(statsByRosterEntry.get(re.id) ?? []);
    const counts = countsFor(re.player, viewerIsCoach, rawCounts);
    return {
      rosterEntryId: re.id,
      // player_id is only non-null here if the viewer can actually see the
      // player row (RLS embeds return null otherwise), so linking to the
      // profile is gated the same way the identity is.
      playerId: re.player ? re.player_id : null,
      uniformNumber: re.uniform_number,
      displayName: displayNameFor(re.player, re.uniform_number, context, viewerIsCoach),
      visibilityScope: re.player?.visibility_scope ?? null,
      leaderboardOptOutTeam: re.player?.leaderboard_opt_out_team ?? false,
      isCoachFallback: re.player?.is_coach_fallback ?? false,
      // Same locked-player guard as playerRepository.getPlayerProfile: a
      // fallback owner never has a real photo, regardless of what's stored.
      photoUrl: re.player?.is_coach_fallback ? null : (re.player?.photo_url ?? null),
      firstName: re.player?.is_coach_fallback ? null : (re.player?.first_name ?? null),
      lastName: re.player?.is_coach_fallback ? null : (re.player?.last_name ?? null),
      displayMode: re.player?.is_coach_fallback ? "uniform" : (re.player?.display_mode ?? "uniform"),
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
  visibilityScope: "public" | "private" | null;
  leaderboardOptOutLeague: boolean;
  counts: BattingCounts;
  stats: CalculatedStats;
}

export interface DivisionLeaderboardHeader {
  leagueName: string;
  divisionName: string;
  season: string;
  year: number;
}

export interface DivisionLeaderboardResult {
  header: DivisionLeaderboardHeader;
  entries: DivisionLeaderboardEntry[];
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
): Promise<DivisionLeaderboardResult> {
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
    .eq("year", thisTeam.year)
    .eq("is_active", true);
  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) {
    return { header: { leagueName: "", divisionName: "", season: "", year: 0 }, entries: [] };
  }

  const teamIds = teams.map((t: any) => t.id);
  const teamById = new Map(teams.map((t: any) => [t.id, t]));
  const thisTeamFull = teamById.get(teamId);
  const header: DivisionLeaderboardHeader = {
    leagueName: thisTeamFull?.division?.league?.name ?? "",
    divisionName: thisTeamFull?.division?.name ?? "",
    season: thisTeamFull?.season ?? "",
    year: thisTeamFull?.year ?? 0,
  };

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_entry")
    .select(
      "id, team_id, uniform_number, player_id, player:player_id(player_tag, first_name, last_name, display_mode, is_coach_fallback, visibility_scope, leaderboard_opt_out_league)"
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

  // Locked (coach-fallback, unclaimed) players never appear on any
  // leaderboard, for anyone -- not even coaching staff, who can still see
  // them on the Roster/Box Score instead.
  const entries = (rosterRows ?? [])
    .filter((re: any) => !re.player?.is_coach_fallback)
    .map((re: any) => {
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
        displayName: displayNameFor(re.player, re.uniform_number, context, false),
        visibilityScope: re.player?.visibility_scope ?? null,
        leaderboardOptOutLeague: re.player?.leaderboard_opt_out_league ?? false,
        counts,
        stats: calculateStats(counts),
      };
    });

  return { header, entries };
}

export interface GameSummary {
  id: string;
  gameNumber: number;
  gameDate: string;
  opponent: string | null;
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
    .select("id, game_number, game_date, opponent")
    .eq("team_id", teamId)
    .order("game_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    id: g.id,
    gameNumber: g.game_number,
    gameDate: g.game_date,
    opponent: g.opponent,
  }));
}

export async function getGameBoxScore(
  supabase: SupabaseClient,
  gameId: string,
  viewerIsCoach: boolean
): Promise<{ game: GameSummary; teamId: string; lines: BoxScoreLine[] }> {
  const { data: game, error: gameError } = await supabase
    .from("game")
    .select("id, team_id, game_number, game_date, opponent")
    .eq("id", gameId)
    .single();
  if (gameError) throw gameError;

  const context = await getTeamJoinContext(supabase, game.team_id);

  const { data: statRows, error: statError } = await supabase
    .from("game_batting_stat")
    .select(
      "roster_entry_id, jersey_number, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf, roster_entry:roster_entry_id(uniform_number, player_id, player:player_id(player_tag, first_name, last_name, display_mode, is_coach_fallback))"
    )
    .eq("game_id", gameId);
  if (statError) throw statError;

  const lines: BoxScoreLine[] = (statRows ?? []).map((row: any) => {
    const uniformNumber = row.roster_entry?.uniform_number ?? row.jersey_number ?? 0;
    const counts = countsFor(row.roster_entry?.player, viewerIsCoach, toCounts(row));
    return {
      rosterEntryId: row.roster_entry_id,
      playerId: row.roster_entry?.player ? row.roster_entry.player_id : null,
      jerseyNumber: row.jersey_number,
      displayName: displayNameFor(row.roster_entry?.player, uniformNumber, context, viewerIsCoach),
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
    },
    teamId: game.team_id,
    lines,
  };
}

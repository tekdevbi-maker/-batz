import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBattingCounts, calculateStats, type BattingCounts, type CalculatedStats } from "./stats";
import { generateLockedPlayerTag } from "./playerTag";

const ZERO_COUNTS: BattingCounts = { ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, sf: 0 };

export type PlayerDisplayMode = "uniform" | "tag" | "real_name";

export interface PlayerIdentity {
  playerTag: string;
  firstName: string | null;
  lastName: string | null;
  displayMode: PlayerDisplayMode;
  uniformNumber?: number | null;
}

// The one place display identity is decided: a parent-controlled per-player
// choice among "#N" (default), their PlayerTag (usable as a custom alias --
// it's a free-text field the parent can edit in Settings), or their real
// name. An unclaimed/coach-fallback player is forced to "uniform" at the
// call site (see displayNameFor in statsRepository.ts) regardless of what's
// stored here, since a coach-fallback owner shouldn't be able to reveal a
// name pre-claim.
export function playerDisplayName(identity: PlayerIdentity): string {
  if (identity.displayMode === "real_name") {
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  if (identity.displayMode === "uniform" && identity.uniformNumber != null) {
    return `#${identity.uniformNumber}`;
  }
  return identity.playerTag;
}

export interface PlayerSeasonLine {
  rosterEntryId: string;
  teamId: string;
  teamName: string;
  divisionName: string;
  leagueName: string;
  season: string;
  year: number;
  seasonStatus: string;
  uniformNumber: number;
  counts: BattingCounts;
  stats: CalculatedStats;
}

export type BatsThrows = "Right" | "Left" | "Switch";

export interface PlayerDemographics {
  heightFeet: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  bats: BatsThrows | null;
  throws: BatsThrows | null;
}

export interface PlayerProfile extends PlayerDemographics {
  playerId: string;
  parentUserId: string;
  displayName: string;
  realName: string | null;
  playerTag: string;
  visibilityScope: "public" | "private";
  displayMode: PlayerDisplayMode;
  leaderboardOptOutTeam: boolean;
  leaderboardOptOutLeague: boolean;
  isOwner: boolean;
  isCoachFallback: boolean;
  parentAttestedAt: string | null;
  seasons: PlayerSeasonLine[];
  careerCounts: BattingCounts;
  careerStats: CalculatedStats;
}

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

// Career = the same aggregation run over every roster_entry the player has
// ever had (spec Section 2's key principle) -- no separate season-sync.
// Returns null when the player doesn't exist OR the viewer isn't allowed
// to see them: RLS filters the row out and the two cases are deliberately
// indistinguishable to the client.
export async function getPlayerProfile(
  supabase: SupabaseClient,
  playerId: string,
  viewerUserId: string
): Promise<PlayerProfile | null> {
  const { data: player, error: playerError } = await supabase
    .from("player")
    .select(
      "id, parent_user_id, first_name, last_name, display_mode, leaderboard_opt_out_team, leaderboard_opt_out_league, player_tag, visibility_scope, height_feet, height_inches, weight_lbs, bats, throws, parent_attested_at, is_coach_fallback"
    )
    .eq("id", playerId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) return null;

  const { data: entries, error: entriesError } = await supabase
    .from("roster_entry")
    .select(
      "id, uniform_number, team:team_id(id, name, season, year, season_status, division:division_id(name, league:league_id(name)))"
    )
    .eq("player_id", playerId);
  if (entriesError) throw entriesError;

  const entryIds = (entries ?? []).map((e: any) => e.id);
  const countsByEntry = new Map<string, BattingCounts[]>();
  if (entryIds.length > 0) {
    const { data: statRows, error: statError } = await supabase
      .from("game_batting_stat")
      .select("roster_entry_id, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf")
      .in("roster_entry_id", entryIds);
    if (statError) throw statError;
    for (const row of statRows ?? []) {
      const list = countsByEntry.get(row.roster_entry_id) ?? [];
      list.push(toCounts(row));
      countsByEntry.set(row.roster_entry_id, list);
    }
  }

  const seasons: PlayerSeasonLine[] = (entries ?? [])
    .map((e: any) => {
      const counts = aggregateBattingCounts(countsByEntry.get(e.id) ?? []);
      const division = e.team?.division;
      return {
        rosterEntryId: e.id,
        teamId: e.team?.id ?? "",
        teamName: e.team?.name ?? "",
        divisionName: division?.name ?? "",
        leagueName: division?.league?.name ?? "",
        season: e.team?.season ?? "",
        year: e.team?.year ?? 0,
        seasonStatus: e.team?.season_status ?? "",
        uniformNumber: e.uniform_number,
        counts,
        stats: calculateStats(counts),
      };
    })
    .sort((a, b) => b.year - a.year || a.season.localeCompare(b.season));

  const careerCounts = aggregateBattingCounts(seasons.map((s) => s.counts));

  // Whether ownership is still the coach-auto-claimed default is answered
  // directly by is_coach_fallback -- NOT by "is the current owner a coach
  // on this team", which used to be used as a proxy (isOwnedByCoach) and
  // is wrong whenever the real claiming parent also happens to coach that
  // team (e.g. an assistant coach whose own kid plays for them): that
  // proxy stayed true forever after a legitimate claim, so "I'm the
  // Parent" kept reappearing for other Followers on an already-claimed
  // player.
  const current = seasons.find((s) => s.seasonStatus === "in_season") ?? seasons[0];
  const currentTeamId = current?.teamId;
  let viewerIsCoachOnTeam = false;
  if (currentTeamId) {
    const { data: viewerCoachRow } = await supabase
      .from("coach_assignment")
      .select("id")
      .eq("team_id", currentTeamId)
      .eq("user_id", viewerUserId)
      .maybeSingle();
    viewerIsCoachOnTeam = !!viewerCoachRow;
  }

  // A locked (coach-fallback, unclaimed) player only reveals its real
  // name/stats to coaching staff on its current team -- anyone else sees
  // just "[TeamName] Player [UniformNumber]" and zeroed career stats,
  // regardless of whatever display_mode happens to be stored.
  const locked = player.is_coach_fallback && !viewerIsCoachOnTeam;
  const effectiveDisplayMode: PlayerDisplayMode = player.is_coach_fallback ? "uniform" : player.display_mode;
  const realName = [player.first_name, player.last_name].filter(Boolean).join(" ").trim() || null;
  const identity: PlayerIdentity = {
    playerTag: player.player_tag,
    firstName: player.first_name,
    lastName: player.last_name,
    displayMode: effectiveDisplayMode,
    uniformNumber: current?.uniformNumber ?? null,
  };

  const displayName = locked
    ? generateLockedPlayerTag({ teamName: current?.teamName ?? "", uniformNumber: current?.uniformNumber ?? "?" })
    : playerDisplayName(identity);
  const careerStats = locked ? calculateStats(ZERO_COUNTS) : calculateStats(careerCounts);

  return {
    playerId: player.id,
    parentUserId: player.parent_user_id,
    displayName,
    realName: locked ? null : realName,
    playerTag: player.player_tag,
    visibilityScope: player.visibility_scope,
    displayMode: effectiveDisplayMode,
    leaderboardOptOutTeam: player.leaderboard_opt_out_team,
    leaderboardOptOutLeague: player.leaderboard_opt_out_league,
    isOwner: player.parent_user_id === viewerUserId,
    isCoachFallback: player.is_coach_fallback,
    parentAttestedAt: player.parent_attested_at,
    seasons: locked ? seasons.map((s) => ({ ...s, counts: ZERO_COUNTS, stats: calculateStats(ZERO_COUNTS) })) : seasons,
    careerCounts: locked ? ZERO_COUNTS : careerCounts,
    careerStats,
    heightFeet: locked ? null : player.height_feet,
    heightInches: locked ? null : player.height_inches,
    weightLbs: locked ? null : player.weight_lbs,
    bats: locked ? null : player.bats,
    throws: locked ? null : player.throws,
  };
}

// The season to show alongside demographics (spec: "Team Name" and
// "Uniform Number" in the Career Profile header) -- the current in-season
// entry if there is one, otherwise just the most recent by year.
export function currentSeasonLine(profile: PlayerProfile): PlayerSeasonLine | null {
  return profile.seasons.find((s) => s.seasonStatus === "in_season") ?? profile.seasons[0] ?? null;
}

export interface MyPlayer {
  playerId: string;
  playerTag: string;
  displayName: string;
  visibilityScope: "public" | "private";
}

export interface MyPlayersResult {
  // Kids the user actually claimed themselves (real parent, or a coach who
  // attested to their own kid via "I'm the Parent").
  myPlayers: MyPlayer[];
  // Roster spots a coach holds only as fallback owner (is_coach_fallback,
  // see auto_claim_roster_entry / reassign_players_to_foster_parent) --
  // never claimed by a real parent. Shown separately, and only while at
  // least one of their teams is still in_season; once every team a
  // fallback player is on has been marked season-complete, they're
  // archived out of both lists entirely (the stats themselves aren't
  // touched -- only Home's lists are filtered, same as Previous Teams
  // doesn't delete anything).
  myTeamPlayers: MyPlayer[];
}

// "Players I Coach" (myTeamPlayers) always lists locked players the caller
// themselves owns as fallback coach -- so unlike a stranger's view, the
// caller is entitled to see the real name here, not the locked tag.
function toMyPlayer(
  p: {
    id: string;
    player_tag: string;
    first_name: string | null;
    last_name: string | null;
    display_mode: PlayerDisplayMode;
    is_coach_fallback: boolean;
    visibility_scope: "public" | "private";
  },
  uniformNumber: number | null
): MyPlayer {
  if (p.is_coach_fallback) {
    const realName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return { playerId: p.id, playerTag: p.player_tag, displayName: realName || p.player_tag, visibilityScope: p.visibility_scope };
  }
  return {
    playerId: p.id,
    playerTag: p.player_tag,
    displayName: playerDisplayName({
      playerTag: p.player_tag,
      firstName: p.first_name,
      lastName: p.last_name,
      displayMode: p.display_mode,
      uniformNumber,
    }),
    visibilityScope: p.visibility_scope,
  };
}

export async function listMyPlayers(supabase: SupabaseClient, userId: string): Promise<MyPlayersResult> {
  const { data, error } = await supabase
    .from("player")
    .select("id, player_tag, first_name, last_name, display_mode, visibility_scope, is_coach_fallback")
    .eq("parent_user_id", userId)
    .order("created_at");
  if (error) throw error;

  const players = data ?? [];
  const playerIds = players.map((p: any) => p.id);
  const fallbackIds = players.filter((p: any) => p.is_coach_fallback).map((p: any) => p.id);

  const activeFallbackIds = new Set<string>();
  const uniformByPlayer = new Map<string, number>();
  if (playerIds.length > 0) {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("roster_entry")
      .select("player_id, uniform_number, team:team_id(season_status)")
      .in("player_id", playerIds);
    if (rosterError) throw rosterError;
    for (const row of (rosterRows ?? []) as any[]) {
      if (row.team?.season_status === "in_season") {
        activeFallbackIds.add(row.player_id);
        uniformByPlayer.set(row.player_id, row.uniform_number);
      } else if (!uniformByPlayer.has(row.player_id)) {
        uniformByPlayer.set(row.player_id, row.uniform_number);
      }
    }
  }

  return {
    myPlayers: players
      .filter((p: any) => !p.is_coach_fallback)
      .map((p: any) => toMyPlayer(p, uniformByPlayer.get(p.id) ?? null)),
    myTeamPlayers: players
      .filter((p: any) => p.is_coach_fallback && activeFallbackIds.has(p.id))
      .map((p: any) => toMyPlayer(p, uniformByPlayer.get(p.id) ?? null)),
  };
}

export interface PlayerSearchResult {
  playerId: string;
  displayName: string;
}

// Search by PlayerTag only (spec Section 8: "Search results and profiles
// display each player's PlayerTag by default" -- there's no stated
// requirement to search by real name, and allowing it would let a
// searcher discover a name the parent hasn't revealed). Results inherit
// can_view_player() RLS automatically: a Private player invisible to the
// searcher simply never comes back, no separate filtering needed here.
export async function searchPlayers(supabase: SupabaseClient, query: string): Promise<PlayerSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("player")
    .select("id, player_tag, first_name, last_name, display_mode, is_coach_fallback")
    .ilike("player_tag", `%${trimmed}%`)
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    playerId: p.id,
    // A locked player's stored player_tag IS already the "[TeamName]
    // Player [N]" default (see generateLockedPlayerTag) -- using it
    // directly here, rather than resolving a real name, keeps a search
    // result from ever revealing a locked player's identity.
    displayName: p.is_coach_fallback
      ? p.player_tag
      : playerDisplayName({
          playerTag: p.player_tag,
          firstName: p.first_name,
          lastName: p.last_name,
          displayMode: p.display_mode,
        }),
  }));
}

export interface PlayerSettingsInput {
  playerTag?: string;
  visibilityScope?: "public" | "private";
  displayMode?: PlayerDisplayMode;
  leaderboardOptOutTeam?: boolean;
  leaderboardOptOutLeague?: boolean;
  heightFeet?: number | null;
  heightInches?: number | null;
  weightLbs?: number | null;
  bats?: BatsThrows | null;
  throws?: BatsThrows | null;
}

// Only the owning parent can update (enforced by RLS, spec Section 7:
// parent-controlled settings / Section 10 accountability rule). All
// demographics fields are voluntary -- explicitly passing null clears a
// field, leaving a key out of the input entirely leaves it untouched.
export async function updatePlayerSettings(
  supabase: SupabaseClient,
  playerId: string,
  input: PlayerSettingsInput
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.playerTag !== undefined) update.player_tag = input.playerTag.trim();
  if (input.visibilityScope !== undefined) update.visibility_scope = input.visibilityScope;
  if (input.displayMode !== undefined) update.display_mode = input.displayMode;
  if (input.leaderboardOptOutTeam !== undefined) update.leaderboard_opt_out_team = input.leaderboardOptOutTeam;
  if (input.leaderboardOptOutLeague !== undefined) update.leaderboard_opt_out_league = input.leaderboardOptOutLeague;
  if (input.heightFeet !== undefined) update.height_feet = input.heightFeet;
  if (input.heightInches !== undefined) update.height_inches = input.heightInches;
  if (input.weightLbs !== undefined) update.weight_lbs = input.weightLbs;
  if (input.bats !== undefined) update.bats = input.bats;
  if (input.throws !== undefined) update.throws = input.throws;
  if (Object.keys(update).length === 0) return;

  const { data, error } = await supabase.from("player").update(update).eq("id", playerId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Update was not applied -- you may not have permission to edit this player.");
}

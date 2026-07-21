import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBattingCounts, calculateStats, type BattingCounts, type CalculatedStats } from "./stats";

export interface PlayerIdentity {
  playerTag: string;
  firstName: string | null;
  lastName: string | null;
  revealFullName: boolean;
}

// The one place display identity is decided (spec Section 7): PlayerTag
// unless the parent has explicitly revealed the real name in Settings.
export function playerDisplayName(identity: PlayerIdentity): string {
  if (identity.revealFullName) {
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
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
  playerTag: string;
  visibilityScope: "public" | "private";
  revealFullName: boolean;
  isOwner: boolean;
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
      "id, parent_user_id, first_name, last_name, reveal_full_name, player_tag, visibility_scope, height_feet, height_inches, weight_lbs, bats, throws"
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

  const identity: PlayerIdentity = {
    playerTag: player.player_tag,
    firstName: player.first_name,
    lastName: player.last_name,
    revealFullName: player.reveal_full_name,
  };

  return {
    playerId: player.id,
    parentUserId: player.parent_user_id,
    displayName: playerDisplayName(identity),
    playerTag: player.player_tag,
    visibilityScope: player.visibility_scope,
    revealFullName: player.reveal_full_name,
    isOwner: player.parent_user_id === viewerUserId,
    seasons,
    careerCounts,
    careerStats: calculateStats(careerCounts),
    heightFeet: player.height_feet,
    heightInches: player.height_inches,
    weightLbs: player.weight_lbs,
    bats: player.bats,
    throws: player.throws,
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

export async function listMyPlayers(supabase: SupabaseClient, userId: string): Promise<MyPlayer[]> {
  const { data, error } = await supabase
    .from("player")
    .select("id, player_tag, first_name, last_name, reveal_full_name, visibility_scope")
    .eq("parent_user_id", userId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    playerId: p.id,
    playerTag: p.player_tag,
    displayName: playerDisplayName({
      playerTag: p.player_tag,
      firstName: p.first_name,
      lastName: p.last_name,
      revealFullName: p.reveal_full_name,
    }),
    visibilityScope: p.visibility_scope,
  }));
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
    .select("id, player_tag, first_name, last_name, reveal_full_name")
    .ilike("player_tag", `%${trimmed}%`)
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    playerId: p.id,
    displayName: playerDisplayName({
      playerTag: p.player_tag,
      firstName: p.first_name,
      lastName: p.last_name,
      revealFullName: p.reveal_full_name,
    }),
  }));
}

export interface PlayerSettingsInput {
  playerTag?: string;
  visibilityScope?: "public" | "private";
  revealFullName?: boolean;
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
  if (input.revealFullName !== undefined) update.reveal_full_name = input.revealFullName;
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

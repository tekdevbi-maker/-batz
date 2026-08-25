import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGameCsvFileName,
  buildSeasonTotalsCsvFileName,
  serializeBattingLinesCsv,
  type ImportedBattingLine,
} from "./gameChangerImport";
import { aggregateBattingCounts, type BattingCounts } from "./stats";
import { calculateStarTiers } from "./starTiers";
import { generateLockedPlayerTag } from "./playerTag";
import { getTeamJoinContext } from "./claimRepository";
import { parseLocalIsoDate } from "./dateFormat";

export interface ExistingGameSummary {
  id: string;
  gameNumber: number;
  gameDate: string;
  opponent: string | null;
}

export interface LiveScoringRosterEntry {
  rosterEntryId: string;
  uniformNumber: number;
  firstName: string;
  lastName: string;
}

// Live scoring needs the literal roster_entry names (what CSV import
// matches against, see matchOrCreateRosterEntries), not the identity-gated
// display name statsRepository's getTeamRosterWithSeasonStats returns --
// a coach setting a batting order for their own team already knows who's
// who regardless of a still-locked player's consent state.
export async function listRosterEntriesForLiveScoring(
  supabase: SupabaseClient,
  teamId: string
): Promise<LiveScoringRosterEntry[]> {
  const { data, error } = await supabase
    .from("roster_entry")
    .select("id, uniform_number, first_name, last_name")
    .eq("team_id", teamId)
    .order("uniform_number");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    rosterEntryId: row.id,
    uniformNumber: row.uniform_number,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
  }));
}

function toSummary(row: {
  id: string;
  game_number: number;
  game_date: string;
  opponent: string | null;
}): ExistingGameSummary {
  return { id: row.id, gameNumber: row.game_number, gameDate: row.game_date, opponent: row.opponent };
}

// Layer 1 of duplicate detection (spec Section 3a): the exact same file,
// byte-for-byte, already imported for this team. Checked before parsing.
export async function findDuplicateFileImport(
  supabase: SupabaseClient,
  teamId: string,
  fileHash: string
): Promise<ExistingGameSummary | null> {
  const { data, error } = await supabase
    .from("game")
    .select("id, game_number, game_date, opponent")
    .eq("team_id", teamId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (error) throw error;
  return data ? toSummary(data) : null;
}

// Layer 2 (soft): a Game already exists on this date for this team.
// Doubleheaders are legitimate, so this warns rather than blocks.
export async function findGamesOnDate(
  supabase: SupabaseClient,
  teamId: string,
  gameDate: string
): Promise<ExistingGameSummary[]> {
  const { data, error } = await supabase
    .from("game")
    .select("id, game_number, game_date, opponent")
    .eq("team_id", teamId)
    .eq("game_date", gameDate);
  if (error) throw error;
  return (data ?? []).map(toSummary);
}

// Recent games for a team, newest first -- powers the delete-a-Game UI.
export async function listRecentGames(
  supabase: SupabaseClient,
  teamId: string,
  limit = 10
): Promise<ExistingGameSummary[]> {
  const { data, error } = await supabase
    .from("game")
    .select("id, game_number, game_date, opponent")
    .eq("team_id", teamId)
    .order("game_number", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSummary);
}

// Powers the Import screen's game-number auto-suggest and the
// "Last game recorded was Game #N against [opponent] on [date]" hint.
export async function getLastGameForTeam(
  supabase: SupabaseClient,
  teamId: string
): Promise<ExistingGameSummary | null> {
  const { data, error } = await supabase
    .from("game")
    .select("id, game_number, game_date, opponent")
    .eq("team_id", teamId)
    .order("game_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toSummary(data) : null;
}

// Other teams in the same League/Division, for the Opponent dropdown.
export async function getDivisionOpponents(
  supabase: SupabaseClient,
  teamId: string
): Promise<Array<{ id: string; name: string }>> {
  const { data: thisTeam, error: teamError } = await supabase
    .from("team")
    .select("division_id")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { data, error } = await supabase
    .from("team")
    .select("id, name")
    .eq("division_id", thisTeam.division_id)
    .neq("id", teamId);
  if (error) throw error;
  return data ?? [];
}

interface RosterEntryRow {
  id: string;
  uniform_number: number;
  first_name: string | null;
  last_name: string | null;
  player_id: string | null;
}

function namesMatch(stored: string | null, imported: string): boolean {
  return (stored ?? "").trim().toLowerCase() === imported.trim().toLowerCase();
}

// Auto-claim (spec: every imported player line is automatically claimed --
// name/uniform number come straight from the file, no manual entry). Lands
// on the team's Head Coach specifically, never whoever happens to be
// running the import (could be an assistant coach) -- done via a
// SECURITY DEFINER RPC since a plain client-side insert can't do that at
// all ("parents can create their own player" requires parent_user_id =
// auth.uid()). Only ever touches a roster_entry with no player_id yet; an
// already-claimed spot's real owner is never overwritten. New players
// default to Private via the player table's column default.
// Two distinct roster spots can land on an identical default PlayerTag --
// most commonly the same jersey number reused by a different real player
// after the original left the team, since the tag is derived from
// uniform number + team context, not from anything guaranteed unique
// long-term. Rather than crash on the DB's unique constraint, disambiguate
// by swapping in "0_1", "0_2", ... for the UniformNumber segment of the
// tag until a free one is found.
async function findFreePlayerTag(
  supabase: SupabaseClient,
  uniformNumber: number,
  tagContext: Omit<Parameters<typeof generateLockedPlayerTag>[0], "uniformNumber">
): Promise<string> {
  let candidate = generateLockedPlayerTag({ ...tagContext, uniformNumber });
  let n = 0;
  // Safety cap -- should never realistically be hit, but guarantees this
  // loop terminates instead of hammering the DB indefinitely.
  while (n < 50) {
    const { data, error } = await supabase
      .from("player")
      .select("id")
      .eq("player_tag", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    n += 1;
    candidate = generateLockedPlayerTag({ ...tagContext, uniformNumber: `0_${n}` });
  }
  throw new Error(`Could not find a free PlayerTag after ${n} attempts for uniform number ${uniformNumber}`);
}

async function claimUnderHeadCoach(
  supabase: SupabaseClient,
  rosterEntryId: string,
  uniformNumber: number,
  firstName: string,
  lastName: string,
  tagContext: Omit<Parameters<typeof generateLockedPlayerTag>[0], "uniformNumber">
): Promise<void> {
  const playerTag = await findFreePlayerTag(supabase, uniformNumber, tagContext);
  const { error } = await supabase.rpc("auto_claim_roster_entry", {
    p_roster_entry_id: rosterEntryId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_player_tag: playerTag,
  });
  if (error) throw error;
}

// Matches each imported line to a RosterEntry by name, not jersey number
// (spec Section 3a: "Number... display only, not identity" / "Last, First
// ... roster matching") -- numbers can be reassigned game-to-game, so a
// matched entry's uniform_number is updated to the latest import. Creates
// a roster_entry when no match exists. Every unclaimed spot touched here
// (new or previously-imported-but-never-claimed) gets auto-claimed under
// the team's Head Coach.
export async function matchOrCreateRosterEntries(
  supabase: SupabaseClient,
  teamId: string,
  lines: ImportedBattingLine[],
  gameId: string
): Promise<string[]> {
  const { data: existing, error } = await supabase
    .from("roster_entry")
    .select("id, uniform_number, first_name, last_name, player_id")
    .eq("team_id", teamId);
  if (error) throw error;

  const context = await getTeamJoinContext(supabase, teamId);
  const tagContext = { teamName: context.teamName };

  const rosterEntries = (existing ?? []) as RosterEntryRow[];
  // Indexed to match `lines` 1:1 -- jersey number is not a safe correlation
  // key here (it's "display only, not identity" per spec, and nothing
  // guarantees it's unique within a single import).
  const rosterEntryIds: string[] = [];

  for (const line of lines) {
    const match = rosterEntries.find(
      (r) => namesMatch(r.first_name, line.firstName) && namesMatch(r.last_name, line.lastName)
    );
    const importedNumber = Number.parseInt(line.jerseyNumber, 10) || 0;

    if (match) {
      rosterEntryIds.push(match.id);
      if (importedNumber && importedNumber !== match.uniform_number) {
        const { error: updateError } = await supabase
          .from("roster_entry")
          .update({ uniform_number: importedNumber })
          .eq("id", match.id);
        if (updateError) throw updateError;
        match.uniform_number = importedNumber;
      }
      if (!match.player_id) {
        await claimUnderHeadCoach(supabase, match.id, importedNumber, line.firstName, line.lastName, tagContext);
        // A GameChanger export can genuinely list the same player twice
        // (e.g. a mid-game position change re-printing their row) -- mark
        // this entry claimed in the in-memory list too, not just the DB,
        // so a second occurrence later in this same file matches here
        // instead of creating ANOTHER roster_entry and re-running
        // claimUnderHeadCoach, which generated an identical PlayerTag and
        // crashed on the unique constraint.
        match.player_id = "pending";
      }
      continue;
    }

    const { data: created, error: insertError } = await supabase
      .from("roster_entry")
      .insert({
        team_id: teamId,
        uniform_number: importedNumber,
        first_name: line.firstName,
        last_name: line.lastName,
        created_by_game_id: gameId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    rosterEntryIds.push(created.id);
    await claimUnderHeadCoach(supabase, created.id, importedNumber, line.firstName, line.lastName, tagContext);
    // Same reasoning as above: this new entry must be visible to the
    // matching logic for the rest of this loop, not just future imports.
    rosterEntries.push({
      id: created.id,
      uniform_number: importedNumber,
      first_name: line.firstName,
      last_name: line.lastName,
      player_id: "pending",
    });
  }

  return rosterEntryIds;
}

export interface ImportGameInput {
  teamId: string;
  gameDate: string; // YYYY-MM-DD
  gameNumber: number;
  opponent: string | null;
  fileHash: string;
  lines: ImportedBattingLine[];
}

export async function importGame(
  supabase: SupabaseClient,
  input: ImportGameInput
): Promise<{ gameId: string }> {
  // Game created first (not after roster matching, as before) so any
  // roster_entry this import creates can be stamped with created_by_game_id
  // -- what lets deleteGame() clean up an accidental wrong-team import's
  // leftover player cards instead of orphaning them. If roster matching
  // fails partway, the empty game row is removed rather than left behind.
  const { data: game, error: gameError } = await supabase
    .from("game")
    .insert({
      team_id: input.teamId,
      game_date: input.gameDate,
      game_number: input.gameNumber,
      opponent: input.opponent,
      file_hash: input.fileHash,
    })
    .select("id")
    .single();
  if (gameError) throw gameError;

  let rosterEntryIds: string[];
  try {
    rosterEntryIds = await matchOrCreateRosterEntries(supabase, input.teamId, input.lines, game.id);
  } catch (err) {
    await supabase.from("game").delete().eq("id", game.id);
    throw err;
  }

  const statRows = input.lines.map((line, i) => ({
    game_id: game.id,
    roster_entry_id: rosterEntryIds[i],
    jersey_number: Number.parseInt(line.jerseyNumber, 10) || null,
    ab: line.ab,
    h: line.h,
    singles: line.singles,
    doubles: line.doubles,
    triples: line.triples,
    hr: line.hr,
    rbi: line.rbi,
    bb: line.bb,
    hbp: line.hbp,
    sf: line.sf,
  }));

  const { error: statsError } = await supabase.from("game_batting_stat").insert(statRows);
  if (statsError) throw statsError;

  // Best-effort (spec Section 8/9): a failure here shouldn't make an
  // otherwise-successful import look like it failed to the coach, who'd
  // then retry into the duplicate-file-hash check.
  try {
    await detectAndRecordMilestones(supabase, input.teamId, game.id, rosterEntryIds);
  } catch (err) {
    console.warn("Milestone detection failed (game import itself succeeded):", err);
  }

  try {
    const { error: importPostError } = await supabase
      .from("activity_feed_item")
      .insert({ team_id: input.teamId, game_id: game.id, category: "game_imported" });
    if (importPostError) throw importPostError;
  } catch (err) {
    console.warn("Game-imported activity post failed (game import itself succeeded):", err);
  }

  return { gameId: game.id };
}

type MilestoneCategory = "hits" | "doubles" | "triples" | "home_runs";

function tierFor(category: MilestoneCategory, counts: BattingCounts): number {
  const tiers = calculateStarTiers(counts);
  return category === "hits" ? tiers.hits : category === "doubles" ? tiers.doubles : category === "triples" ? tiers.triples : tiers.homeRuns;
}

// One activity_feed_item per star-tier increase this game caused, compared
// against the player's season totals before this game (spec Section 9:
// current-season only). Unclaimed roster spots have no player_id and
// therefore no feed to post to -- silently skipped, not an error.
async function detectAndRecordMilestones(
  supabase: SupabaseClient,
  teamId: string,
  gameId: string,
  rosterEntryIds: string[]
): Promise<void> {
  if (rosterEntryIds.length === 0) return;

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_entry")
    .select("id, player_id")
    .in("id", rosterEntryIds);
  if (rosterError) throw rosterError;

  const playerByRosterEntry = new Map<string, string>();
  for (const r of rosterRows ?? []) {
    if (r.player_id) playerByRosterEntry.set(r.id, r.player_id);
  }
  const claimedIds = [...playerByRosterEntry.keys()];
  if (claimedIds.length === 0) return;

  const { data: statRows, error: statError } = await supabase
    .from("game_batting_stat")
    .select("roster_entry_id, game_id, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf")
    .in("roster_entry_id", claimedIds);
  if (statError) throw statError;

  const beforeByEntry = new Map<string, BattingCounts[]>();
  const currentByEntry = new Map<string, BattingCounts>();
  for (const row of statRows ?? []) {
    const counts: BattingCounts = {
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
    if (row.game_id === gameId) {
      currentByEntry.set(row.roster_entry_id, counts);
    } else {
      const list = beforeByEntry.get(row.roster_entry_id) ?? [];
      list.push(counts);
      beforeByEntry.set(row.roster_entry_id, list);
    }
  }

  const categories: MilestoneCategory[] = ["hits", "doubles", "triples", "home_runs"];
  const newItems: Array<{ player_id: string; team_id: string; game_id: string; category: MilestoneCategory; tier: number }> = [];

  for (const rosterEntryId of claimedIds) {
    const current = currentByEntry.get(rosterEntryId);
    if (!current) continue;
    const before = aggregateBattingCounts(beforeByEntry.get(rosterEntryId) ?? []);
    const after = aggregateBattingCounts([before, current]);
    for (const category of categories) {
      const beforeTier = tierFor(category, before);
      const afterTier = tierFor(category, after);
      if (afterTier > beforeTier) {
        newItems.push({
          player_id: playerByRosterEntry.get(rosterEntryId)!,
          team_id: teamId,
          game_id: gameId,
          category,
          tier: afterTier,
        });
      }
    }
  }

  if (newItems.length === 0) return;
  const { error: insertError } = await supabase.from("activity_feed_item").insert(newItems);
  if (insertError) throw insertError;
}

// No partial edits (spec Section 3a) -- a coach who needs to fix a game
// deletes it and re-imports. Routed through a SECURITY DEFINER RPC (not a
// plain client-side delete) so an accidental wrong-team import can also
// clean up any roster spot IT auto-created that's still unclaimed and has
// no stats left from any other game -- otherwise the player card would
// survive the delete with nothing left pointing to it.
export async function deleteGame(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_game_and_cleanup_roster", { p_game_id: gameId });
  if (error) throw error;
}

// Regenerates the game's CSV from the stats actually stored in the
// database, rather than keeping the originally-uploaded file anywhere --
// so the export always matches what's currently on record, even if a
// game's stats were ever corrected via delete-and-reimport.
//
// Goes through get_team_game_stat_lines (coach-gated, SECURITY DEFINER)
// instead of a plain client select -- game_batting_stat/roster_entry are
// RLS-restricted by the Section 7 visibility model (can_view_stat_line),
// which is correct for public stat viewing but wrong for a coach's own
// export: a Private or other-owned claimed player's row would otherwise
// silently vanish from the CSV with no error, exactly like the reported
// "only 1 player" bug.
export async function exportGameCsv(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ fileName: string; csvText: string }> {
  const { data: game, error: gameError } = await supabase
    .from("game")
    .select("team_id, game_number, game_date, opponent, team:team_id(name)")
    .eq("id", gameId)
    .single();
  if (gameError) throw gameError;

  const { data: statRows, error: statError } = await supabase.rpc("get_team_game_stat_lines", {
    p_team_id: game.team_id,
    p_game_id: gameId,
  });
  if (statError) throw statError;

  const lines: ImportedBattingLine[] = (statRows ?? []).map((row: any) => ({
    jerseyNumber: String(row.uniform_number),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
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
  }));

  const teamName = (game as any).team?.name ?? "Team";
  const fileName = buildGameCsvFileName(game.game_number, teamName, game.opponent, parseLocalIsoDate(game.game_date));
  return { fileName, csvText: serializeBattingLinesCsv(lines) };
}

// Whole-season record-keeping export for the coach who ran every game --
// every roster spot that season, real names regardless of claim status
// (same reasoning as listRosterEntriesForLiveScoring: a coach already
// knows who's who), summed across every game. Must run BEFORE
// mark_season_ended, since that RPC deletes unclaimed roster spots and
// their stat rows once it folds them into the team's anonymized total --
// this is the last chance to capture their real names in an export.
//
// Goes through get_team_season_totals (coach-gated, SECURITY DEFINER,
// already summed in SQL) for the same reason exportGameCsv does -- a
// plain select here would silently drop any player the viewer can't see
// under the Section 7 visibility model.
export async function exportSeasonTotalsCsv(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ fileName: string; csvText: string }> {
  const { data: team, error: teamError } = await supabase
    .from("team")
    .select("name, season, year")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { data: totalsRows, error: totalsError } = await supabase.rpc("get_team_season_totals", {
    p_team_id: teamId,
  });
  if (totalsError) throw totalsError;

  const lines: ImportedBattingLine[] = (totalsRows ?? []).map((row: any) => ({
    jerseyNumber: String(row.uniform_number),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
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
  }));

  const fileName = buildSeasonTotalsCsvFileName(team.name, team.season, team.year);
  return { fileName, csvText: serializeBattingLinesCsv(lines) };
}

// Saves a Season Totals CSV into the head coach's own account in Supabase
// Storage instead of an on-device save -- available from any device the
// coach logs into afterward, and doesn't need an OS-level file-system
// permission prompt at the moment the season is marked complete. Private
// bucket keyed by "{coach_user_id}/{file_name}" (see
// 20260825150000_season_totals_storage.sql); upsert since a re-run of the
// same team/season/year would otherwise collide on file name.
export async function saveSeasonTotalsToProfile(
  supabase: SupabaseClient,
  userId: string,
  fileName: string,
  csvText: string
): Promise<void> {
  const { error } = await supabase.storage
    .from("season-totals")
    .upload(`${userId}/${fileName}`, csvText, { contentType: "text/csv", upsert: true });
  if (error) throw error;
}

export interface SeasonTotalsFile {
  name: string;
  path: string;
  createdAt: string | null;
}

export async function listMySeasonTotals(supabase: SupabaseClient, userId: string): Promise<SeasonTotalsFile[]> {
  const { data, error } = await supabase.storage.from("season-totals").list(userId, {
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  return (data ?? []).map((f) => ({ name: f.name, path: `${userId}/${f.name}`, createdAt: f.created_at ?? null }));
}

export async function downloadSeasonTotalsCsvText(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("season-totals").download(path);
  if (error) throw error;
  // React Native's Blob polyfill has no .text() method (browser-only) --
  // FileReader.readAsText is the cross-platform way to get a Blob's
  // string content here.
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read the downloaded file."));
    reader.readAsText(data);
  });
}

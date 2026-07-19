import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedBattingLine } from "./gameChangerImport";
import { aggregateBattingCounts, type BattingCounts } from "./stats";
import { calculateStarTiers } from "./starTiers";

export interface ExistingGameSummary {
  id: string;
  gameNumber: number;
  gameDate: string;
  opponent: string | null;
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
}

function namesMatch(stored: string | null, imported: string): boolean {
  return (stored ?? "").trim().toLowerCase() === imported.trim().toLowerCase();
}

// Matches each imported line to a RosterEntry by name, not jersey number
// (spec Section 3a: "Number... display only, not identity" / "Last, First
// ... roster matching") -- numbers can be reassigned game-to-game, so a
// matched entry's uniform_number is updated to the latest import. Creates
// an unclaimed roster_entry (player_id null) when no match exists, same as
// a never-claimed roster spot.
export async function matchOrCreateRosterEntries(
  supabase: SupabaseClient,
  teamId: string,
  lines: ImportedBattingLine[]
): Promise<string[]> {
  const { data: existing, error } = await supabase
    .from("roster_entry")
    .select("id, uniform_number, first_name, last_name")
    .eq("team_id", teamId);
  if (error) throw error;

  const rosterEntries = (existing ?? []) as RosterEntryRow[];
  // Indexed to match `lines` 1:1 -- jersey number is not a safe correlation
  // key here (it's "display only, not identity" per spec, and nothing
  // guarantees it's unique within a single import).
  const rosterEntryIds: string[] = [];

  for (const line of lines) {
    const match = rosterEntries.find(
      (r) => namesMatch(r.first_name, line.firstName) && namesMatch(r.last_name, line.lastName)
    );

    if (match) {
      rosterEntryIds.push(match.id);
      const importedNumber = Number.parseInt(line.jerseyNumber, 10);
      if (!Number.isNaN(importedNumber) && importedNumber !== match.uniform_number) {
        const { error: updateError } = await supabase
          .from("roster_entry")
          .update({ uniform_number: importedNumber })
          .eq("id", match.id);
        if (updateError) throw updateError;
      }
      continue;
    }

    const { data: created, error: insertError } = await supabase
      .from("roster_entry")
      .insert({
        team_id: teamId,
        uniform_number: Number.parseInt(line.jerseyNumber, 10) || 0,
        first_name: line.firstName,
        last_name: line.lastName,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    rosterEntryIds.push(created.id);
  }

  return rosterEntryIds;
}

export interface ImportGameInput {
  teamId: string;
  gameDate: string; // YYYY-MM-DD
  gameNumber: number;
  opponent: string | null;
  timeOfDay: "Morning" | "Afternoon" | "Night";
  fileHash: string;
  lines: ImportedBattingLine[];
}

export async function importGame(
  supabase: SupabaseClient,
  input: ImportGameInput
): Promise<{ gameId: string }> {
  const rosterEntryIds = await matchOrCreateRosterEntries(supabase, input.teamId, input.lines);

  const { data: game, error: gameError } = await supabase
    .from("game")
    .insert({
      team_id: input.teamId,
      game_date: input.gameDate,
      game_number: input.gameNumber,
      opponent: input.opponent,
      time_of_day: input.timeOfDay,
      file_hash: input.fileHash,
    })
    .select("id")
    .single();
  if (gameError) throw gameError;

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
// deletes it and re-imports. The FK from game_batting_stat to game cascades
// (Sprint 1 schema), so this is the entire "recalculation" needed; no
// audit log, by design.
export async function deleteGame(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { error } = await supabase.from("game").delete().eq("id", gameId);
  if (error) throw error;
}

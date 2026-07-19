/**
 * One-off manual verification: exercises the real gamesRepository/parser
 * code against the live linked Supabase schema, using the service_role
 * key (so it runs independent of RLS -- policies land in Sprint 6).
 * Not part of `npm test`; jest-expo's RN test environment intercepts real
 * network calls, so this runs standalone via `npx tsx scripts/verify-import.ts`.
 * Requires SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_URL in env.
 * Seeds a throwaway league/division/team, imports game1.csv, asserts the
 * results, then deletes everything it created.
 */
import * as fs from "fs";
import * as path from "path";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { parseGameChangerBattingCsv } from "../lib/gameChangerImport";
import { hashFileContents } from "../lib/fileHash";
import {
  deleteGame,
  findDuplicateFileImport,
  findGamesOnDate,
  getLastGameForTeam,
  importGame,
} from "../lib/gamesRepository";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!serviceRoleKey || !supabaseUrl) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_URL first.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: league, error: leagueError } = await supabase
    .from("league")
    .insert({ name: "__verify_league__", sanctioning_body: "Little League", initials: `VL${Date.now()}` })
    .select("id")
    .single();
  if (leagueError) throw leagueError;

  try {
    const { data: division, error: divisionError } = await supabase
      .from("division")
      .insert({ league_id: league.id, name: "12U" })
      .select("id")
      .single();
    if (divisionError) throw divisionError;

    const { data: team, error: teamError } = await supabase
      .from("team")
      .insert({ division_id: division.id, name: "__verify_team__", season: "Spring", year: 2026 })
      .select("id")
      .single();
    if (teamError) throw teamError;

    const csvText = fs.readFileSync(path.join(__dirname, "..", "lib", "__fixtures__", "game1.csv"), "utf-8");
    const lines = parseGameChangerBattingCsv(csvText);
    const fileHash = hashFileContents(csvText);

    const { gameId } = await importGame(supabase, {
      teamId: team.id,
      gameDate: "2026-04-01",
      gameNumber: 1,
      opponent: "__verify_opponent__",
      timeOfDay: "Afternoon",
      fileHash,
      lines,
    });
    console.log("imported game", gameId);

    const { data: rosterEntries, error: rosterError } = await supabase
      .from("roster_entry")
      .select("id, uniform_number, first_name, last_name")
      .eq("team_id", team.id);
    if (rosterError) throw rosterError;
    assert.equal(rosterEntries?.length, 11, "expected 11 roster entries");
    const merkal = rosterEntries?.find((r) => r.last_name === "Merkal");
    assert.equal(merkal?.first_name, "Brayden");
    assert.equal(merkal?.uniform_number, 8);
    console.log("roster entries OK (11 created, Merkal matched by name)");

    const { data: statRows, error: statError } = await supabase
      .from("game_batting_stat")
      .select("ab, h")
      .eq("game_id", gameId);
    if (statError) throw statError;
    assert.equal(statRows?.length, 11, "expected 11 stat rows");
    const totalAb = statRows!.reduce((sum, r) => sum + r.ab, 0);
    const totalH = statRows!.reduce((sum, r) => sum + r.h, 0);
    assert.equal(totalAb, 16, "team AB total should match the file's Totals row");
    assert.equal(totalH, 3, "team H total should match the file's Totals row");
    console.log("game_batting_stat totals OK (16 AB, 3 H)");

    const duplicate = await findDuplicateFileImport(supabase, team.id, fileHash);
    assert.equal(duplicate?.id, gameId, "byte-for-byte duplicate should be found");
    console.log("duplicate file detection OK");

    const sameDate = await findGamesOnDate(supabase, team.id, "2026-04-01");
    assert.equal(sameDate.length, 1);
    console.log("same-date lookup OK");

    const lastGame = await getLastGameForTeam(supabase, team.id);
    assert.equal(lastGame?.gameNumber, 1);
    console.log("last-game lookup OK");

    await deleteGame(supabase, gameId);
    const { data: statsAfterDelete, error: afterDeleteError } = await supabase
      .from("game_batting_stat")
      .select("id")
      .eq("game_id", gameId);
    if (afterDeleteError) throw afterDeleteError;
    assert.equal(statsAfterDelete?.length, 0, "deleting a game should cascade to its stat rows");
    console.log("delete-a-game cascade OK");

    // Renumber Merkal and re-import as "game 2" to confirm name-based
    // re-matching updates uniform_number instead of duplicating the entry.
    const renumbered = lines.map((l) => (l.lastName === "Merkal" ? { ...l, jerseyNumber: "99" } : l));
    await importGame(supabase, {
      teamId: team.id,
      gameDate: "2026-04-08",
      gameNumber: 2,
      opponent: "__verify_opponent__",
      timeOfDay: "Morning",
      fileHash: hashFileContents(csvText + "-renumbered"),
      lines: renumbered,
    });
    const { data: afterRenumber, error: renumberError } = await supabase
      .from("roster_entry")
      .select("uniform_number")
      .eq("team_id", team.id)
      .eq("last_name", "Merkal");
    if (renumberError) throw renumberError;
    assert.equal(afterRenumber?.length, 1, "should still be exactly one Merkal roster entry");
    assert.equal(afterRenumber?.[0].uniform_number, 99, "uniform_number should update to the latest import");
    console.log("re-match-by-name (jersey number changed) OK");

    console.log("\nALL CHECKS PASSED");
  } finally {
    // Cascades to team/roster_entry/game/game_batting_stat.
    await supabase.from("league").delete().eq("id", league.id);
  }
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});

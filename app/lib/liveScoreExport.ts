import { TEMPLATE_HEADERS, type ImportedBattingLine } from "./gameChangerImport";
import type { AtBatEntry, LineupPlayer } from "./liveScoreState";

// Walks per plate-appearance entries down to the same per-player totals
// shape the @Batz blank template (and therefore parseTemplateCsv) expects
// -- BB/HBP/SF don't count as an at-bat, everything else (hits and outs)
// does, same as real baseball scoring rules.
export function buildLiveScoreLines(lineup: LineupPlayer[], atBats: AtBatEntry[]): ImportedBattingLine[] {
  // A benched or replaced player drops out of `lineup`, but their at-bats
  // (and the name/number snapshot on each entry) must still be reported --
  // so the player list here is current lineup (including anyone with zero
  // at-bats so far) plus anyone else who batted before leaving it.
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const player of lineup) {
    if (!seen.has(player.rosterEntryId)) {
      orderedIds.push(player.rosterEntryId);
      seen.add(player.rosterEntryId);
    }
  }
  for (const atBat of atBats) {
    if (!seen.has(atBat.rosterEntryId)) {
      orderedIds.push(atBat.rosterEntryId);
      seen.add(atBat.rosterEntryId);
    }
  }

  return orderedIds.map((rosterEntryId) => {
    const own = atBats.filter((a) => a.rosterEntryId === rosterEntryId);
    const lineupPlayer = lineup.find((p) => p.rosterEntryId === rosterEntryId);
    const uniformNumber = lineupPlayer?.uniformNumber ?? own[0].uniformNumber;
    const firstName = lineupPlayer?.firstName ?? own[0].firstName;
    const lastName = lineupPlayer?.lastName ?? own[0].lastName;
    const count = (outcome: AtBatEntry["outcome"]) => own.filter((a) => a.outcome === outcome).length;
    const singles = count("1B");
    const doubles = count("2B");
    const triples = count("3B");
    const hr = count("HR");
    const bb = count("BB");
    const hbp = count("HBP");
    const sf = count("SF");
    const outs = count("OUT");
    const h = singles + doubles + triples + hr;
    const ab = h + outs;
    const rbi = own.reduce((sum, a) => sum + a.rbi, 0);
    return {
      jerseyNumber: String(uniformNumber),
      lastName,
      firstName,
      ab,
      h,
      singles,
      doubles,
      triples,
      hr,
      rbi,
      bb,
      hbp,
      sf,
    };
  });
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildLiveScoreCsv(lineup: LineupPlayer[], atBats: AtBatEntry[]): string {
  const rows = buildLiveScoreLines(lineup, atBats).map((line) => [
    line.jerseyNumber,
    line.lastName,
    line.firstName,
    line.ab,
    line.h,
    line.singles,
    line.doubles,
    line.triples,
    line.hr,
    line.rbi,
    line.bb,
    line.hbp,
    line.sf,
  ]);

  const lines = [TEMPLATE_HEADERS, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

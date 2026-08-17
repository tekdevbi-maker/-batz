import { TEMPLATE_HEADERS } from "./gameChangerImport";
import type { AtBatEntry, LineupPlayer } from "./liveScoreState";

// Walks per plate-appearance entries down to the same per-player totals
// shape the @Batz blank template (and therefore parseTemplateCsv) expects
// -- BB/HBP/SF don't count as an at-bat, everything else (hits and outs)
// does, same as real baseball scoring rules.
function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildLiveScoreCsv(lineup: LineupPlayer[], atBats: AtBatEntry[]): string {
  const rows = lineup.map((player) => {
    const own = atBats.filter((a) => a.rosterEntryId === player.rosterEntryId);
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
    return [player.uniformNumber, player.lastName, player.firstName, ab, h, singles, doubles, triples, hr, rbi, bb, hbp, sf];
  });

  const lines = [TEMPLATE_HEADERS, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

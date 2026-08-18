import Papa from "papaparse";
import type { BattingCounts } from "./stats";

export class GameChangerFormatError extends Error {}

export interface ImportedBattingLine extends BattingCounts {
  jerseyNumber: string;
  lastName: string;
  firstName: string;
}

// GameChanger's "Export stats" CSV merges three sections (Batting, Pitching,
// Fielding) into one wide sheet. Column header TEXT collides across
// sections (H, BB, SO, K-L, HBP, CS, PIK, CI all appear in both Batting and
// Pitching), so this must read by column POSITION within the Batting block,
// never by name lookup. These indices were mapped against a real export
// (app/lib/__fixtures__/game1.csv) and are re-validated against the file's
// own header row on every parse, so a GameChanger format change fails loudly
// here instead of silently mis-attributing stats.
const EXPECTED_BATTING_HEADERS: Record<number, string> = {
  0: "Number",
  1: "Last",
  2: "First",
  5: "AB",
  10: "H",
  11: "1B",
  12: "2B",
  13: "3B",
  14: "HR",
  15: "RBI",
  17: "BB",
  20: "HBP",
  22: "SF",
};

function toInt(value: string | undefined): number {
  const n = Number.parseInt(value ?? "0", 10);
  return Number.isNaN(n) ? 0 : n;
}

export function parseGameChangerBattingCsv(csvText: string): ImportedBattingLine[] {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: false });
  if (parsed.errors.length > 0) {
    throw new GameChangerFormatError(`Failed to parse CSV: ${parsed.errors[0].message}`);
  }
  const rows = parsed.data;

  // Row 0: merged section-header banner ("Batting"/"Pitching"/"Fielding") - discarded.
  // Row 1: the real column-name row - validated against expected positions, then discarded.
  if (rows.length < 2) {
    throw new GameChangerFormatError(
      "CSV has too few rows to be a recognized stats export (expected a section-header row and a column-header row before any data)."
    );
  }
  const headerRow = rows[1];
  for (const [indexStr, expectedName] of Object.entries(EXPECTED_BATTING_HEADERS)) {
    const index = Number(indexStr);
    const actualName = headerRow[index];
    if (actualName !== expectedName) {
      throw new GameChangerFormatError(
        `Expected column ${index} to be "${expectedName}" but found "${actualName}". The export format may have changed.`
      );
    }
  }

  const lines: ImportedBattingLine[] = [];
  let sawSectionEndRow = false;

  // GameChanger's own export tooling isn't consistent about the section-
  // boundary marker in column A: the desktop/web "Export stats" flow uses
  // "Totals", but a real mobile-app export (app/lib/__fixtures__/game2-team-marker.csv)
  // uses "Team" instead, immediately followed by a Glossary section. Either
  // one means "stop here" -- the row itself and everything after it
  // (Glossary, blank rows) is discarded, never counted as a player line.
  const SECTION_END_MARKERS = new Set(["Totals", "Team"]);

  for (const row of rows.slice(2)) {
    const jerseyNumber = row[0]?.trim() ?? "";
    if (SECTION_END_MARKERS.has(jerseyNumber)) {
      sawSectionEndRow = true;
      break;
    }
    if (jerseyNumber === "") {
      continue;
    }

    const line: ImportedBattingLine = {
      jerseyNumber,
      lastName: row[1] ?? "",
      firstName: row[2] ?? "",
      ab: toInt(row[5]),
      h: toInt(row[10]),
      singles: toInt(row[11]),
      doubles: toInt(row[12]),
      triples: toInt(row[13]),
      hr: toInt(row[14]),
      rbi: toInt(row[15]),
      bb: toInt(row[17]),
      hbp: toInt(row[20]),
      sf: toInt(row[22]),
    };

    const hitTypeSum = line.singles + line.doubles + line.triples + line.hr;
    if (hitTypeSum !== line.h) {
      throw new GameChangerFormatError(
        `Row for ${line.firstName} ${line.lastName} (#${line.jerseyNumber}): H=${line.h} but 1B+2B+3B+HR=${hitTypeSum}. This usually means column positions have shifted.`
      );
    }

    lines.push(line);
  }

  if (!sawSectionEndRow) {
    throw new GameChangerFormatError(
      "No \"Totals\" or \"Team\" row found — this doesn't look like a complete stats export."
    );
  }

  return lines;
}

// Fallback path for a CSV that doesn't match the known template: just the
// raw grid, no position assumptions, so the coach can manually tell us
// which column (and row range) holds each stat via ColumnMappingModal.
export function parseRawCsvRows(csvText: string): string[][] {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: false });
  if (parsed.errors.length > 0) {
    throw new GameChangerFormatError(`Failed to parse CSV: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

export interface ColumnMapping {
  jerseyNumber: number;
  lastName: number;
  firstName: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  sf: number;
}

// Extracts batting lines using a coach-confirmed column mapping instead of
// the fixed GameChanger positions above -- rows outside [startRow, endRow]
// (both inclusive, 0-indexed against the raw grid) are ignored, and any
// row with a blank jersey-number cell within that range is skipped rather
// than treated as an end marker, since an arbitrary template has no
// guaranteed "Totals"/"Team" row.
export function extractWithColumnMapping(
  rows: string[][],
  mapping: ColumnMapping,
  startRow: number,
  endRow: number
): ImportedBattingLine[] {
  const lines: ImportedBattingLine[] = [];
  for (let i = startRow; i <= endRow && i < rows.length; i++) {
    const row = rows[i];
    const jerseyNumber = row[mapping.jerseyNumber]?.trim() ?? "";
    if (jerseyNumber === "") continue;

    lines.push({
      jerseyNumber,
      lastName: row[mapping.lastName]?.trim() ?? "",
      firstName: row[mapping.firstName]?.trim() ?? "",
      ab: toInt(row[mapping.ab]),
      h: toInt(row[mapping.h]),
      singles: toInt(row[mapping.singles]),
      doubles: toInt(row[mapping.doubles]),
      triples: toInt(row[mapping.triples]),
      hr: toInt(row[mapping.hr]),
      rbi: toInt(row[mapping.rbi]),
      bb: toInt(row[mapping.bb]),
      hbp: toInt(row[mapping.hbp]),
      sf: toInt(row[mapping.sf]),
    });
  }
  return lines;
}

// The @Batz-provided blank template (see TEMPLATE_CSV_TEXT below): fixed
// column order by design, so a coach who fills it out and uploads it gets
// parsed instantly without the manual column-mapping step.
export const TEMPLATE_HEADERS = [
  "Jersey Number",
  "Last Name",
  "First Name",
  "AB",
  "H",
  "1B",
  "2B",
  "3B",
  "HR",
  "RBI",
  "BB",
  "HBP",
  "SF",
];

export const TEMPLATE_CSV_TEXT = TEMPLATE_HEADERS.join(",") + "\n";

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Serializes parsed batting lines back into the @Batz template shape --
// shared by live-scoring's export and the Recent Games "Export" button, so
// both produce a file re-importable through the same TEMPLATE_MAPPING path.
export function serializeBattingLinesCsv(lines: ImportedBattingLine[]): string {
  const rows = lines.map((line) => [
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
  const csvRows = [TEMPLATE_HEADERS, ...rows].map((row) => row.map(csvField).join(","));
  return csvRows.join("\n") + "\n";
}

// Shared by live-scoring's save-to-phone flow and the Recent Games export
// button -- same naming convention either way: batz_live_game{N}_{MMDDYY}_{Team}vs{Opponent}.csv
export function buildGameCsvFileName(
  gameNumber: string | number,
  teamName: string,
  opponent: string | null,
  date: Date
): string {
  const mmddyy =
    String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0") + String(date.getFullYear()).slice(-2);
  const safe = (text: string) => text.replace(/[^a-zA-Z0-9]+/g, "");
  return `batz_live_game${safe(String(gameNumber || "1"))}_${mmddyy}_${safe(teamName || "Team")}vs${safe(opponent || "Opponent")}.csv`;
}

const TEMPLATE_MAPPING: ColumnMapping = {
  jerseyNumber: 0,
  lastName: 1,
  firstName: 2,
  ab: 3,
  h: 4,
  singles: 5,
  doubles: 6,
  triples: 7,
  hr: 8,
  rbi: 9,
  bb: 10,
  hbp: 11,
  sf: 12,
};

// Returns null (not a throw) when the header row doesn't match the
// template exactly -- callers fall back to manual column mapping instead
// of treating a near-miss as a hard error.
export function parseTemplateCsv(csvText: string): ImportedBattingLine[] | null {
  const rows = parseRawCsvRows(csvText);
  if (rows.length < 1) return null;
  const header = (rows[0] ?? []).map((h) => h?.trim());
  const isTemplate = TEMPLATE_HEADERS.every((expected, i) => header[i] === expected);
  if (!isTemplate) return null;
  return extractWithColumnMapping(rows, TEMPLATE_MAPPING, 1, rows.length - 1);
}

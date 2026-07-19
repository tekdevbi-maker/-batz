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
      "CSV has too few rows to be a GameChanger stats export (expected a section-header row and a column-header row before any data)."
    );
  }
  const headerRow = rows[1];
  for (const [indexStr, expectedName] of Object.entries(EXPECTED_BATTING_HEADERS)) {
    const index = Number(indexStr);
    const actualName = headerRow[index];
    if (actualName !== expectedName) {
      throw new GameChangerFormatError(
        `Expected column ${index} to be "${expectedName}" but found "${actualName}". GameChanger's export format may have changed.`
      );
    }
  }

  const lines: ImportedBattingLine[] = [];
  let sawTotalsRow = false;

  for (const row of rows.slice(2)) {
    const jerseyNumber = row[0]?.trim() ?? "";
    if (jerseyNumber === "Totals") {
      sawTotalsRow = true;
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

  if (!sawTotalsRow) {
    throw new GameChangerFormatError(
      "No \"Totals\" row found — this doesn't look like a complete GameChanger stats export."
    );
  }

  return lines;
}

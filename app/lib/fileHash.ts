import { sha256 } from "js-sha256";
import type { ImportedBattingLine } from "./gameChangerImport";

// Byte-for-byte duplicate detection (spec Section 3a): hash the raw file
// contents before parsing starts, so a re-uploaded CSV is flagged
// immediately rather than after a full parse.
export function hashFileContents(rawText: string): string {
  return sha256(rawText);
}

// Content-based duplicate detection: hashes the GameChanger filename (it
// carries a name unique per league/division/team/season/year) plus every
// non-blank cell actually parsed out of the Batting section -- jersey
// number, name, and every stat column -- rather than the raw file bytes.
// Catches a re-exported duplicate even if GameChanger's incidental
// formatting (line endings, trailing whitespace, column padding) differs
// between the two exports, which a byte-for-byte hash would miss.
export function hashParsedImport(fileName: string, lines: ImportedBattingLine[]): string {
  const canonical = [
    fileName.trim(),
    ...lines.map((l) =>
      [
        l.jerseyNumber,
        l.lastName,
        l.firstName,
        l.ab,
        l.h,
        l.singles,
        l.doubles,
        l.triples,
        l.hr,
        l.rbi,
        l.bb,
        l.hbp,
        l.sf,
      ].join(",")
    ),
  ].join(";");
  return sha256(canonical);
}

import { sha256 } from "js-sha256";

// Byte-for-byte duplicate detection (spec Section 3a): hash the raw file
// contents before parsing starts, so a re-uploaded CSV is flagged
// immediately rather than after a full parse.
export function hashFileContents(rawText: string): string {
  return sha256(rawText);
}

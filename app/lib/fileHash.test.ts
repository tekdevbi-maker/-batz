import * as fs from "fs";
import * as path from "path";
import { hashFileContents } from "./fileHash";

const fixtureCsv = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "game1.csv"),
  "utf-8"
);

describe("hashFileContents", () => {
  test("is deterministic for identical content", () => {
    expect(hashFileContents(fixtureCsv)).toBe(hashFileContents(fixtureCsv));
  });

  test("differs for content that differs by a single byte", () => {
    const modified = fixtureCsv.replace('"Warshaw"', '"Warshawx"');
    expect(modified).not.toBe(fixtureCsv);
    expect(hashFileContents(modified)).not.toBe(hashFileContents(fixtureCsv));
  });

  test("matches a known SHA-256 vector", () => {
    // echo -n "abc" | sha256sum
    expect(hashFileContents("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

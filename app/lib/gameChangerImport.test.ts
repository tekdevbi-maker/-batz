import * as fs from "fs";
import * as path from "path";
import {
  GameChangerFormatError,
  parseGameChangerBattingCsv,
  type ImportedBattingLine,
} from "./gameChangerImport";

const fixtureCsv = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "game1.csv"),
  "utf-8"
);

// Same underlying game, but exported from GameChanger's mobile app rather
// than the desktop "Export stats" flow -- confirmed via a real Sprint 9
// device test that this variant uses "Team" as the section-end marker in
// column A instead of "Totals", which the parser didn't originally handle.
const teamMarkerFixtureCsv = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "game2-team-marker.csv"),
  "utf-8"
);

function line(overrides: Partial<ImportedBattingLine>): ImportedBattingLine {
  return {
    jerseyNumber: "",
    lastName: "",
    firstName: "",
    ab: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    hbp: 0,
    sf: 0,
    ...overrides,
  };
}

describe("parseGameChangerBattingCsv against a real export (game1.csv)", () => {
  const lines = parseGameChangerBattingCsv(fixtureCsv);

  test("parses exactly the 11 player rows, in order, excluding Totals/blank/Glossary", () => {
    expect(lines).toHaveLength(11);
    expect(lines.map((l) => l.jerseyNumber)).toEqual([
      "2", "5", "8", "10", "12", "17", "22", "23", "45", "78", "99",
    ]);
  });

  test("Warshaw, Carter: 0-for-2, no walks (all-batting-zero line)", () => {
    expect(lines[0]).toEqual(
      line({ jerseyNumber: "2", lastName: "Warshaw", firstName: "Carter", ab: 2 })
    );
  });

  test("Breedlove, Grant: 0-for-1 with a walk", () => {
    expect(lines[1]).toEqual(
      line({ jerseyNumber: "5", lastName: "Breedlove", firstName: "Grant", ab: 1, bb: 1 })
    );
  });

  test("Merkal, Brayden: 2-for-2, both singles (pulls from column 11, not name lookup)", () => {
    expect(lines[2]).toEqual(
      line({ jerseyNumber: "8", lastName: "Merkal", firstName: "Brayden", ab: 2, h: 2, singles: 2 })
    );
  });

  test("Vaughan, Archie: 0-for-1 with an HBP -- distinguishes Batting HBP (col 20) from the identically-named Pitching HBP later in the row", () => {
    expect(lines[3]).toEqual(
      line({ jerseyNumber: "10", lastName: "Vaughan", firstName: "Archie", ab: 1, hbp: 1 })
    );
  });

  test("Hauck, Hudson: 0-for-2", () => {
    expect(lines[4]).toEqual(
      line({ jerseyNumber: "12", lastName: "Hauck", firstName: "Hudson", ab: 2 })
    );
  });

  test("Ago, Zion: 0-for-2", () => {
    expect(lines[5]).toEqual(
      line({ jerseyNumber: "17", lastName: "Ago", firstName: "Zion", ab: 2 })
    );
  });

  test("White, Trevor: 1-for-2, a single", () => {
    expect(lines[6]).toEqual(
      line({ jerseyNumber: "22", lastName: "White", firstName: "Trevor", ab: 2, h: 1, singles: 1 })
    );
  });

  test("Hueber, Grant: 0-for-1 with a walk", () => {
    expect(lines[7]).toEqual(
      line({ jerseyNumber: "23", lastName: "Hueber", firstName: "Grant", ab: 1, bb: 1 })
    );
  });

  test("Hill, Rylan: 0-for-1 with a walk", () => {
    expect(lines[8]).toEqual(
      line({ jerseyNumber: "45", lastName: "Hill", firstName: "Rylan", ab: 1, bb: 1 })
    );
  });

  test("Flositz, Harrison: 0-for-1 with a walk", () => {
    expect(lines[9]).toEqual(
      line({ jerseyNumber: "78", lastName: "Flositz", firstName: "Harrison", ab: 1, bb: 1 })
    );
  });

  test("Flipse, Teddy: 0-for-1 with a walk", () => {
    expect(lines[10]).toEqual(
      line({ jerseyNumber: "99", lastName: "Flipse", firstName: "Teddy", ab: 1, bb: 1 })
    );
  });

  test("team totals for the game sum correctly across all 11 lines (matches the file's own Totals row: 16 AB, 3 H, 5 BB, 1 HBP)", () => {
    const totals = lines.reduce(
      (acc, l) => ({
        ab: acc.ab + l.ab,
        h: acc.h + l.h,
        bb: acc.bb + l.bb,
        hbp: acc.hbp + l.hbp,
      }),
      { ab: 0, h: 0, bb: 0, hbp: 0 }
    );
    expect(totals).toEqual({ ab: 16, h: 3, bb: 5, hbp: 1 });
  });
});

describe("parseGameChangerBattingCsv against a real export using \"Team\" as the section-end marker (game2-team-marker.csv)", () => {
  const lines = parseGameChangerBattingCsv(teamMarkerFixtureCsv);

  test("parses exactly the 11 player rows, excluding the Team/blank/Glossary rows", () => {
    expect(lines).toHaveLength(11);
    expect(lines.map((l) => l.jerseyNumber)).toEqual([
      "8", "22", "99", "78", "45", "23", "17", "12", "10", "5", "2",
    ]);
  });

  test("team totals sum correctly across all 11 lines (matches the file's own Team row: 16 AB, 3 H, 5 BB, 1 HBP)", () => {
    const totals = lines.reduce(
      (acc, l) => ({
        ab: acc.ab + l.ab,
        h: acc.h + l.h,
        bb: acc.bb + l.bb,
        hbp: acc.hbp + l.hbp,
      }),
      { ab: 0, h: 0, bb: 0, hbp: 0 }
    );
    expect(totals).toEqual({ ab: 16, h: 3, bb: 5, hbp: 1 });
  });
});

describe("parseGameChangerBattingCsv defensive checks", () => {
  test("throws GameChangerFormatError when the header row doesn't match expected column positions", () => {
    const badCsv = [
      '"","","","Batting"',
      '"WrongHeader","Last","First","AB"',
      '"1","Smith","Joe","3"',
      '"Totals","","",""',
    ].join("\n");

    expect(() => parseGameChangerBattingCsv(badCsv)).toThrow(GameChangerFormatError);
  });

  test("throws GameChangerFormatError when there's no Totals row", () => {
    const lines = fixtureCsv.split("\n");
    const withoutTotals = lines.filter((l) => !l.startsWith('"Totals"')).join("\n");
    expect(() => parseGameChangerBattingCsv(withoutTotals)).toThrow(GameChangerFormatError);
  });

  test("throws GameChangerFormatError when H doesn't match the sum of hit types (signals column misalignment)", () => {
    const headerRow =
      '"Number","Last","First","GP","PA","AB","AVG","OBP","OPS","SLG","H","1B","2B","3B","HR","RBI","R","BB","SO","K-L","HBP","SAC","SF"';
    // H=3 but 1B+2B+3B+HR=2 -- an internally inconsistent data row.
    const inconsistentRow =
      '"8","Merkal","Brayden","1","2","2","1.000","1.000","2.000","1.000","3","2","0","0","0","0","1","0","0","0","0","0","0"';
    const badCsv = [
      '"","","","Batting"',
      headerRow,
      inconsistentRow,
      '"Totals","","",""',
    ].join("\n");

    expect(() => parseGameChangerBattingCsv(badCsv)).toThrow(GameChangerFormatError);
  });
});

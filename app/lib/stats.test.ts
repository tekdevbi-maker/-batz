import {
  aggregateBattingCounts,
  battingAverage,
  calculateStats,
  onBasePercentage,
  onBasePlusSlugging,
  sluggingPercentage,
  totalBases,
  type BattingCounts,
} from "./stats";

function counts(overrides: Partial<BattingCounts>): BattingCounts {
  return {
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

describe("single-game line: 2-for-4 with a double and a walk", () => {
  // AB=4, H=2 (1 single, 1 double), BB=1
  const line = counts({ ab: 4, h: 2, singles: 1, doubles: 1, rbi: 1, bb: 1 });

  test("AVG = 2/4 = .500", () => {
    expect(battingAverage(line)).toBeCloseTo(0.5, 10);
  });

  test("total bases = 1*1 + 1*2 = 3", () => {
    expect(totalBases(line)).toBe(3);
  });

  test("SLG = 3/4 = .750", () => {
    expect(sluggingPercentage(line)).toBeCloseTo(0.75, 10);
  });

  test("OBP = (2+1+0)/(4+1+0+0) = 3/5 = .600", () => {
    expect(onBasePercentage(line)).toBeCloseTo(0.6, 10);
  });

  test("OPS = .600 + .750 = 1.350", () => {
    expect(onBasePlusSlugging(line)).toBeCloseTo(1.35, 10);
  });
});

describe("season line: 500 AB, .300/.366/.470 slash", () => {
  // 150 H = 100 1B + 30 2B + 5 3B + 15 HR; 50 BB, 5 HBP, 5 SF
  const season = counts({
    ab: 500,
    h: 150,
    singles: 100,
    doubles: 30,
    triples: 5,
    hr: 15,
    bb: 50,
    hbp: 5,
    sf: 5,
  });

  test("AVG = 150/500 = .300", () => {
    expect(battingAverage(season)).toBeCloseTo(0.3, 10);
  });

  test("total bases = 100 + 60 + 15 + 60 = 235", () => {
    expect(totalBases(season)).toBe(235);
  });

  test("SLG = 235/500 = .470", () => {
    expect(sluggingPercentage(season)).toBeCloseTo(0.47, 10);
  });

  test("OBP = 205/560", () => {
    expect(onBasePercentage(season)).toBeCloseTo(205 / 560, 10);
  });

  test("OPS = SLG + OBP", () => {
    const stats = calculateStats(season);
    expect(stats.ops).toBeCloseTo(stats.obp + stats.slg, 10);
    expect(stats.ops).toBeCloseTo(0.47 + 205 / 560, 10);
  });
});

describe("aggregation across multiple games (career/season total from per-game rows)", () => {
  const gameA = counts({ ab: 3, h: 1, singles: 1, bb: 1 });
  const gameB = counts({ ab: 4, h: 2, doubles: 1, hr: 1, rbi: 3, hbp: 1 });

  test("raw counts sum correctly", () => {
    const total = aggregateBattingCounts([gameA, gameB]);
    expect(total).toEqual(
      counts({ ab: 7, h: 3, singles: 1, doubles: 1, hr: 1, rbi: 3, bb: 1, hbp: 1 })
    );
  });

  test("derived stats from the aggregate match hand-calculated values", () => {
    const total = aggregateBattingCounts([gameA, gameB]);
    // AVG = 3/7, TB = 1 + 2 + 4 = 7, SLG = 7/7 = 1.000
    // OBP = (3+1+1)/(7+1+1+0) = 5/9
    expect(battingAverage(total)).toBeCloseTo(3 / 7, 10);
    expect(sluggingPercentage(total)).toBeCloseTo(1.0, 10);
    expect(onBasePercentage(total)).toBeCloseTo(5 / 9, 10);
    expect(onBasePlusSlugging(total)).toBeCloseTo(1.0 + 5 / 9, 10);
  });

  test("deleting a game (Section 3a) is equivalent to aggregating without it", () => {
    // Simulates the spec's delete-a-Game behavior: since stats are always
    // derived on read from raw per-game rows, removing a game's row from
    // the aggregation input is the entire "recalculation" needed.
    const withBothGames = aggregateBattingCounts([gameA, gameB]);
    const afterDeletingGameB = aggregateBattingCounts([gameA]);

    expect(withBothGames.ab).toBe(7);
    expect(afterDeletingGameB).toEqual(gameA);
    expect(battingAverage(afterDeletingGameB)).toBeCloseTo(1 / 3, 10);
  });
});

describe("edge cases", () => {
  test("0 AB and no plate appearances at all => everything is 0", () => {
    const empty = counts({});
    const stats = calculateStats(empty);
    expect(stats).toEqual({ avg: 0, obp: 0, slg: 0, ops: 0 });
  });

  test("0 AB but 2 walks (no hits, no outs) => AVG/SLG are 0, OBP is 1.000", () => {
    const walksOnly = counts({ bb: 2 });
    const stats = calculateStats(walksOnly);
    expect(stats.avg).toBe(0);
    expect(stats.slg).toBe(0);
    expect(stats.obp).toBeCloseTo(1.0, 10);
    expect(stats.ops).toBeCloseTo(1.0, 10);
  });

  test("aggregating zero games returns all-zero counts, not NaN", () => {
    const total = aggregateBattingCounts([]);
    expect(total).toEqual(counts({}));
    expect(calculateStats(total)).toEqual({ avg: 0, obp: 0, slg: 0, ops: 0 });
  });

  test("a home-run-only game maxes out SLG at 4.000", () => {
    const line = counts({ ab: 1, h: 1, hr: 1 });
    expect(sluggingPercentage(line)).toBeCloseTo(4.0, 10);
  });
});

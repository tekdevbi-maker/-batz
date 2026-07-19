import { calculateStarTiers, doublesStars, hitsStars, homeRunsStars, triplesStars } from "./starTiers";

describe("hitsStars", () => {
  test("every table row from spec Section 9", () => {
    expect(hitsStars(0)).toBe(1);
    expect(hitsStars(2)).toBe(1);
    expect(hitsStars(3)).toBe(2);
    expect(hitsStars(7)).toBe(2);
    expect(hitsStars(8)).toBe(3);
    expect(hitsStars(12)).toBe(3);
    expect(hitsStars(13)).toBe(4);
    expect(hitsStars(19)).toBe(4);
    expect(hitsStars(20)).toBe(5);
    expect(hitsStars(50)).toBe(5);
  });
});

describe("doublesStars", () => {
  test("0 doubles gets no star at all, unlike hits", () => {
    expect(doublesStars(0)).toBe(0);
  });

  test("every table row from spec Section 9", () => {
    expect(doublesStars(1)).toBe(1);
    expect(doublesStars(2)).toBe(1);
    expect(doublesStars(3)).toBe(2);
    expect(doublesStars(4)).toBe(2);
    expect(doublesStars(5)).toBe(3);
    expect(doublesStars(6)).toBe(3);
    expect(doublesStars(7)).toBe(4);
    expect(doublesStars(8)).toBe(4);
    expect(doublesStars(9)).toBe(5);
    expect(doublesStars(20)).toBe(5);
  });
});

describe("triplesStars", () => {
  test("no star until the first triple, and no 1-star or 3-star tier exists", () => {
    expect(triplesStars(0)).toBe(0);
    expect(triplesStars(1)).toBe(2);
    expect(triplesStars(2)).toBe(4);
    expect(triplesStars(3)).toBe(5);
    expect(triplesStars(9)).toBe(5);
  });
});

describe("homeRunsStars", () => {
  test("no star until the first HR, and only two tiers exist", () => {
    expect(homeRunsStars(0)).toBe(0);
    expect(homeRunsStars(1)).toBe(3);
    expect(homeRunsStars(2)).toBe(5);
    expect(homeRunsStars(10)).toBe(5);
  });
});

describe("calculateStarTiers", () => {
  test("computes all four categories from a single counts object, ignoring RBI (no star category)", () => {
    expect(calculateStarTiers({ h: 8, doubles: 1, triples: 0, hr: 1 })).toEqual({
      hits: 3,
      doubles: 1,
      triples: 0,
      homeRuns: 3,
    });
  });

  test("a brand-new player with zero hits still gets the guaranteed 1-star hits badge", () => {
    expect(calculateStarTiers({ h: 0, doubles: 0, triples: 0, hr: 0 })).toEqual({
      hits: 1,
      doubles: 0,
      triples: 0,
      homeRuns: 0,
    });
  });
});

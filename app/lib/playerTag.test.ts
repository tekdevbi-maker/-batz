import { generateDefaultPlayerTag } from "./playerTag";

describe("generateDefaultPlayerTag", () => {
  test("matches the spec Section 4 field format", () => {
    expect(
      generateDefaultPlayerTag({
        uniformNumber: 23,
        division: "12U",
        teamName: "Tigers",
        season: "Spring",
        year: 2026,
        leagueInitials: "W",
      })
    ).toBe("Player_23_12U_Tigers_Spring_2026_W");
  });

  test("strips spaces/punctuation from division, team name, and league initials", () => {
    expect(
      generateDefaultPlayerTag({
        uniformNumber: 5,
        division: "12-U AAA",
        teamName: "Winter Park Tigers!",
        season: "Fall",
        year: 2026,
        leagueInitials: "WPLL",
      })
    ).toBe("Player_5_12UAAA_WinterParkTigers_Fall_2026_WPLL");
  });

  test("two teams with the same name in different seasons don't collide", () => {
    const spring = generateDefaultPlayerTag({
      uniformNumber: 7,
      division: "10U",
      teamName: "Tigers",
      season: "Spring",
      year: 2026,
      leagueInitials: "W",
    });
    const fall = generateDefaultPlayerTag({
      uniformNumber: 7,
      division: "10U",
      teamName: "Tigers",
      season: "Fall",
      year: 2026,
      leagueInitials: "W",
    });
    expect(spring).not.toBe(fall);
  });
});

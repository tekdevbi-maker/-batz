import { deriveInitials } from "./leagueInitials";

describe("deriveInitials", () => {
  test("takes the first letter of each word, uppercased", () => {
    expect(deriveInitials("Winter Park Little League")).toBe("WPLL");
  });

  test("collapses extra whitespace", () => {
    expect(deriveInitials("  Winter   Park  ")).toBe("WP");
  });

  test("handles a single-word name", () => {
    expect(deriveInitials("Independent")).toBe("I");
  });
});

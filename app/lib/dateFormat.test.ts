import { formatDateDisplay, parseLocalIsoDate, toLocalIsoDate } from "./dateFormat";

describe("toLocalIsoDate / parseLocalIsoDate round-trip", () => {
  test("a local Date converts to the matching ISO string", () => {
    expect(toLocalIsoDate(new Date(2026, 6, 20))).toBe("2026-07-20");
  });

  test("pads single-digit month and day", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  test("parseLocalIsoDate builds the same local calendar date back", () => {
    const parsed = parseLocalIsoDate("2026-07-20");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(20);
  });

  test("round-trips without shifting a day near a DST boundary (e.g. Nov 1)", () => {
    const iso = "2026-11-01";
    expect(toLocalIsoDate(parseLocalIsoDate(iso))).toBe(iso);
  });
});

describe("formatDateDisplay", () => {
  test("formats as M/D/YY with no leading zeros", () => {
    expect(formatDateDisplay("2026-07-20")).toBe("7/20/26");
  });

  test("single-digit month and day both drop their leading zero", () => {
    expect(formatDateDisplay("2026-01-05")).toBe("1/5/26");
  });
});

// Local-date-component based (not .toISOString(), which converts to UTC
// first and can shift the calendar day near midnight in timezones behind
// UTC) -- matters here since the native date picker returns local Date
// objects, and the app stores gameDate as a plain "YYYY-MM-DD" string.
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toLocalIsoDate(new Date());
}

// Inverse of toLocalIsoDate -- constructs via local components too, not
// `new Date(iso)`, which parses "YYYY-MM-DD" as UTC midnight.
export function parseLocalIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "YYYY-MM-DD" -> "M/D/YY" (no leading zeros), the format Import a Game
// displays to the user.
export function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

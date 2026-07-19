import type { SupabaseClient } from "@supabase/supabase-js";

// e.g. "Winter Park Little League" -> "WPLL" (spec Section 2: used to
// generate PlayerTags, first-come-first-served).
export function deriveInitials(leagueName: string): string {
  return leagueName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// Colliding initials get a trailing number appended (spec Section 2, e.g.
// "WLL2" for the second league whose name derives to "WLL").
export async function generateUniqueInitials(
  supabase: SupabaseClient,
  leagueName: string
): Promise<string> {
  const base = deriveInitials(leagueName);
  const { data, error } = await supabase.from("league").select("initials").ilike("initials", `${base}%`);
  if (error) throw error;

  const existing = new Set((data ?? []).map((r: { initials: string }) => r.initials));
  if (!existing.has(base)) return base;

  let n = 2;
  while (existing.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

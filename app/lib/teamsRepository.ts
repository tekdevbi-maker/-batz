import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoachedTeam {
  id: string;
  name: string;
  season: string;
  year: number;
}

// Teams the signed-in user coaches (spec Section 6: eventually the Home
// screen's team switcher; for now just enough to navigate without pasting
// a team UUID by hand).
export async function listMyCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select("team:team_id(id, name, season, year)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.team).filter(Boolean);
}

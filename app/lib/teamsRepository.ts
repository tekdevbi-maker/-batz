import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoachedTeam {
  id: string;
  name: string;
  season: string;
  year: number;
}

function inSeasonOnly(rows: any[]): CoachedTeam[] {
  return rows
    .map((row) => row.team)
    .filter((team) => team && team.season_status === "in_season")
    .map((team) => ({ id: team.id, name: team.name, season: team.season, year: team.year }));
}

// Teams the signed-in user coaches. Only in-season teams surface here
// (spec Section 6: "Only in-season teams appear on Home" -- historical
// access still exists, just not on this list).
export async function listMyCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select("team:team_id(id, name, season, year, season_status)")
    .eq("user_id", userId);
  if (error) throw error;
  return inSeasonOnly(data ?? []);
}

// Teams the signed-in user has claimed a player on (spec Section 6: "as
// coach or as a claimed parent").
export async function listMyMemberTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("team_membership")
    .select("team:team_id(id, name, season, year, season_status)")
    .eq("user_id", userId);
  if (error) throw error;
  return inSeasonOnly(data ?? []);
}

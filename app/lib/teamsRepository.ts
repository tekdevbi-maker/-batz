import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoachedTeam {
  id: string;
  name: string;
  divisionName: string;
  season: string;
  year: number;
}

function inSeasonOnly(rows: any[]): CoachedTeam[] {
  return rows
    .map((row) => row.team)
    .filter((team) => team && team.season_status === "in_season")
    .map((team) => ({
      id: team.id,
      name: team.name,
      divisionName: team.division?.name ?? "",
      season: team.season,
      year: team.year,
    }));
}

// Teams the signed-in user coaches. Only in-season teams surface here
// (spec Section 6: "Only in-season teams appear on Home" -- historical
// access still exists, just not on this list).
export async function listMyCoachedTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("coach_assignment")
    .select("team:team_id(id, name, season, year, season_status, division:division_id(name))")
    .eq("user_id", userId);
  if (error) throw error;
  return inSeasonOnly(data ?? []);
}

// Teams the signed-in user has claimed a player on (spec Section 6: "as
// coach or as a claimed parent").
export async function listMyMemberTeams(supabase: SupabaseClient, userId: string): Promise<CoachedTeam[]> {
  const { data, error } = await supabase
    .from("team_membership")
    .select("team:team_id(id, name, season, year, season_status, division:division_id(name))")
    .eq("user_id", userId);
  if (error) throw error;
  return inSeasonOnly(data ?? []);
}

export async function updateTeamName(supabase: SupabaseClient, teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from("team").update({ name }).eq("id", teamId);
  if (error) throw error;
}

// Uploads to the "team-logos" Storage bucket at "{teamId}/logo.<ext>"
// (upsert: true, so re-uploading replaces the same object rather than
// accumulating orphans) and points team.logo_url at the public URL. RLS on
// storage.objects restricts the upload itself to a coach of that team (or
// an admin) -- see supabase/migrations/20260723181500_team_logo_storage.sql.
export async function uploadTeamLogo(
  supabase: SupabaseClient,
  teamId: string,
  localUri: string,
  contentType: string
): Promise<string> {
  const ext = contentType.split("/")[1] || "jpg";
  const path = `${teamId}/logo.${ext}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("team-logos")
    .upload(path, arrayBuffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("team-logos").getPublicUrl(path);
  // Cache-bust so a re-uploaded logo doesn't keep showing a stale cached
  // image at the same URL (RN's Image cache keys purely off the URI).
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("team").update({ logo_url: publicUrl }).eq("id", teamId);
  if (updateError) throw updateError;

  return publicUrl;
}

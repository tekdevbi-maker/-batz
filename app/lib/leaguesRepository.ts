import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUniqueInitials } from "./leagueInitials";

// Admin-only, backs the autosuggest on the Impersonate-a-User field.
export async function listAllUserEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_all_users_for_impersonation");
  if (error) throw error;
  return (data ?? []).map((row: { email: string }) => row.email);
}

export interface League {
  id: string;
  name: string;
  initials: string;
  verificationStatus: "pending" | "verified";
}

export interface Division {
  id: string;
  leagueId: string;
  name: string;
}

function toLeague(row: any): League {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    verificationStatus: row.verification_status,
  };
}

function toDivision(row: any): Division {
  return { id: row.id, leagueId: row.league_id, name: row.name };
}

// PostgREST caps an unbounded select at 1000 rows by default -- the seeded
// national league list is ~3800 rows, so a plain select() silently drops
// everything alphabetically past the cutoff (e.g. "Winter Park..." never
// comes back). Page through in batches of 1000 to get the full catalog.
const LEAGUE_PAGE_SIZE = 1000;

export async function listLeagues(supabase: SupabaseClient): Promise<League[]> {
  const all: League[] = [];
  for (let from = 0; ; from += LEAGUE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("league")
      .select("*")
      .order("name")
      .range(from, from + LEAGUE_PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data ?? []).map(toLeague));
    if (!data || data.length < LEAGUE_PAGE_SIZE) break;
  }
  return all;
}

export async function listDivisions(supabase: SupabaseClient, leagueId: string): Promise<Division[]> {
  const { data, error } = await supabase.from("division").select("*").eq("league_id", leagueId).order("name");
  if (error) throw error;
  return (data ?? []).map(toDivision);
}

// Self-serve path (spec Section 5): a coach typing a League name not in the
// dropdown always creates it as pending, regardless of who's calling this --
// the "pending" status itself is what the RLS insert policy enforces for
// non-admins (see supabase/migrations/20260719011114_auth_and_ownership_rls.sql).
export async function createPendingLeague(
  supabase: SupabaseClient,
  input: { name: string }
): Promise<League> {
  const initials = await generateUniqueInitials(supabase, input.name);
  const { data, error } = await supabase
    .from("league")
    .insert({
      name: input.name,
      initials,
      verification_status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toLeague(data);
}

// Admin-only path: creates a League that's immediately verified, skipping
// the self-serve pending-review hold.
export async function createVerifiedLeague(
  supabase: SupabaseClient,
  input: { name: string }
): Promise<League> {
  const initials = await generateUniqueInitials(supabase, input.name);
  const { data, error } = await supabase
    .from("league")
    .insert({
      name: input.name,
      initials,
      verification_status: "verified",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toLeague(data);
}

export async function verifyLeague(supabase: SupabaseClient, leagueId: string): Promise<void> {
  const { error } = await supabase.from("league").update({ verification_status: "verified" }).eq("id", leagueId);
  if (error) throw error;
}

export async function deleteLeague(supabase: SupabaseClient, leagueId: string): Promise<void> {
  const { error } = await supabase.from("league").delete().eq("id", leagueId);
  if (error) throw error;
}

// Divisions don't carry League's verification concern (spec has no
// equivalent "Division verification" step) -- see the RLS migration for why
// this is open to any authenticated user rather than admin-only.
export async function createDivision(
  supabase: SupabaseClient,
  input: { leagueId: string; name: string }
): Promise<Division> {
  const { data, error } = await supabase
    .from("division")
    .insert({ league_id: input.leagueId, name: input.name })
    .select("*")
    .single();
  if (error) throw error;
  return toDivision(data);
}

export async function deleteDivision(supabase: SupabaseClient, divisionId: string): Promise<void> {
  const { error } = await supabase.from("division").delete().eq("id", divisionId);
  if (error) throw error;
}

export interface CreateTeamInput {
  divisionId: string;
  name: string;
  sport: "Baseball" | "Softball";
  season: "Spring" | "Summer" | "Fall" | "Winter";
  year: number;
  logoUrl?: string | null;
  // Historical-stats registrations (backfilling a completed season) create
  // an Inactive team: excluded from leaderboards/counts, but still gets a
  // real Follow link. Defaults true (a normal, currently-competing team).
  isActive?: boolean;
  // A historical registration's season has already wrapped up, so it
  // belongs under Home's "Previous Teams" (season_status = 'ended') from
  // the moment it's created, not the in-season "Teams I Coach" grid.
  // Defaults to 'in_season' (a normal, currently-competing team).
  seasonStatus?: "in_season" | "ended";
}

export async function createTeam(supabase: SupabaseClient, input: CreateTeamInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("team")
    .insert({
      division_id: input.divisionId,
      name: input.name,
      sport: input.sport,
      season: input.season,
      year: input.year,
      logo_url: input.logoUrl ?? null,
      is_active: input.isActive ?? true,
      season_status: input.seasonStatus ?? "in_season",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export interface SameGroupTeam {
  id: string;
  name: string;
}

// Page 11 of the DEV registration wizard: every other ACTIVE team sharing
// this team's League + Sport + Division + Season + Year -- Inactive
// (historical-stats) teams never count toward or appear in this list,
// same as they're excluded from the leaderboard itself.
export async function listSameGroupTeams(
  supabase: SupabaseClient,
  input: { divisionId: string; sport: "Baseball" | "Softball"; season: string; year: number; excludeTeamId: string }
): Promise<SameGroupTeam[]> {
  const { data, error } = await supabase
    .from("team")
    .select("id, name")
    .eq("division_id", input.divisionId)
    .eq("sport", input.sport)
    .eq("season", input.season)
    .eq("year", input.year)
    .eq("is_active", true)
    .neq("id", input.excludeTeamId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export interface DuplicateTeamMatch {
  name: string;
  coachFirstName: string | null;
  coachLastInitial: string | null;
}

// DEV wizard's Team Name page (pre-creation duplicate-name warning): only
// meaningful when reusing an EXISTING league, since a brand-new League or
// Division can't already contain a team. Division is looked up by name
// within the league rather than by id, since the Division isn't actually
// created until "Complete Registration" runs.
export async function findDuplicateTeamNames(
  supabase: SupabaseClient,
  input: {
    leagueId: string;
    divisionName: string;
    sport: "Baseball" | "Softball";
    season: string;
    year: number;
    name: string;
  }
): Promise<DuplicateTeamMatch[]> {
  const { data: division, error: divError } = await supabase
    .from("division")
    .select("id")
    .eq("league_id", input.leagueId)
    .ilike("name", input.divisionName)
    .maybeSingle();
  if (divError) throw divError;
  if (!division) return [];

  const { data: teams, error } = await supabase
    .from("team")
    .select("id, name")
    .eq("division_id", division.id)
    .eq("sport", input.sport)
    .eq("season", input.season)
    .eq("year", input.year)
    .ilike("name", input.name);
  if (error) throw error;
  if (!teams || teams.length === 0) return [];

  const { data: coaches, error: coachError } = await supabase
    .from("coach_assignment")
    .select("team_id, first_name, last_name")
    .eq("role", "primary")
    .in("team_id", teams.map((t) => t.id));
  if (coachError) throw coachError;

  return teams.map((t) => {
    const coach = coaches?.find((c) => c.team_id === t.id);
    return {
      name: t.name,
      coachFirstName: coach?.first_name ?? null,
      coachLastInitial: coach?.last_name ? `${coach.last_name.charAt(0).toUpperCase()}.` : null,
    };
  });
}

export async function assignPrimaryCoach(
  supabase: SupabaseClient,
  input: { teamId: string; userId: string; firstName: string; lastName: string }
): Promise<void> {
  const { error } = await supabase.from("coach_assignment").insert({
    team_id: input.teamId,
    user_id: input.userId,
    role: "primary",
    first_name: input.firstName,
    last_name: input.lastName,
  });
  if (error) throw error;
}

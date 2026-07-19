import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUniqueInitials } from "./leagueInitials";

export const SANCTIONING_BODIES = [
  "Little League",
  "Babe Ruth League",
  "PONY Baseball/Softball",
  "Dixie Youth Baseball",
  "USSSA",
  "AABC",
  "Independent",
] as const;
export type SanctioningBody = (typeof SANCTIONING_BODIES)[number];

export interface League {
  id: string;
  name: string;
  sanctioningBody: string;
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
    sanctioningBody: row.sanctioning_body,
    initials: row.initials,
    verificationStatus: row.verification_status,
  };
}

function toDivision(row: any): Division {
  return { id: row.id, leagueId: row.league_id, name: row.name };
}

export async function listLeagues(supabase: SupabaseClient): Promise<League[]> {
  const { data, error } = await supabase.from("league").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(toLeague);
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
  input: { name: string; sanctioningBody: SanctioningBody }
): Promise<League> {
  const initials = await generateUniqueInitials(supabase, input.name);
  const { data, error } = await supabase
    .from("league")
    .insert({
      name: input.name,
      sanctioning_body: input.sanctioningBody,
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
  input: { name: string; sanctioningBody: SanctioningBody }
): Promise<League> {
  const initials = await generateUniqueInitials(supabase, input.name);
  const { data, error } = await supabase
    .from("league")
    .insert({
      name: input.name,
      sanctioning_body: input.sanctioningBody,
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
  season: "Spring" | "Fall";
  year: number;
  logoUrl?: string | null;
}

export async function createTeam(supabase: SupabaseClient, input: CreateTeamInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("team")
    .insert({
      division_id: input.divisionId,
      name: input.name,
      season: input.season,
      year: input.year,
      logo_url: input.logoUrl ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function assignPrimaryCoach(
  supabase: SupabaseClient,
  input: { teamId: string; userId: string }
): Promise<void> {
  const { error } = await supabase
    .from("coach_assignment")
    .insert({ team_id: input.teamId, user_id: input.userId, role: "primary" });
  if (error) throw error;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { aggregateBattingCounts, calculateStats, EMPTY_BATTING_COUNTS, type BattingCounts, type CalculatedStats } from "./stats";
import type { BatsThrows } from "./playerRepository";

// Fully local, device-only players — created straight from the user's own
// profile with no team/coach/roster involvement at all, per explicit
// request (2026-09-21). Distinct from the Supabase-backed `player` table:
// nothing here ever leaves the device, and there's no parent/coach
// ownership model to enforce since there's only ever one "owner" (whoever's
// device it's on).

const STORAGE_KEY = "@batz/local_players";

export interface LocalSeasonInput {
  year: string;
  season: string;
  team: string;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
}

export interface LocalPlayer {
  id: string;
  firstName: string;
  lastName: string;
  uniformNumber: number | null;
  heightFeet: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  bats: BatsThrows | null;
  throws: BatsThrows | null;
  // Player-level, not per-season — matches the single league/division/team
  // line shown at the top of the existing stats-back card design.
  leagueName: string;
  divisionName: string;
  currentTeamName: string;
  currentSeason: string;
  currentSeasonYear: string;
  // Local file:// URIs (from expo-image-picker / CircleCropModal) — there's
  // no Supabase Storage upload step here since this player never leaves
  // the device, unlike the real player-photo/team-logo upload flows.
  photoUrl: string | null;
  teamLogoUrl: string | null;
  // Capped at 3 — manual entry only, no game-by-game import behind this.
  seasons: LocalSeasonInput[];
  createdAt: string;
}

export const MAX_LOCAL_SEASONS = 3;
// "Double digit" stats — manual entry only, no 100+ counting stat inputs.
export const MAX_STAT_VALUE = 99;

function seasonToCounts(s: LocalSeasonInput): BattingCounts {
  // Singles isn't asked for directly (matches the existing card's own
  // column set, which never shows it either) — derived the same way
  // totalBases already assumes elsewhere: hits minus the extra-base ones.
  const singles = Math.max(0, s.h - s.doubles - s.triples - s.hr);
  return { ...EMPTY_BATTING_COUNTS, ab: s.ab, h: s.h, singles, doubles: s.doubles, triples: s.triples, hr: s.hr, rbi: s.rbi, bb: s.bb };
}

export interface LocalPlayerCardData {
  seasons: { year: number; season: string; teamName: string; counts: BattingCounts; stats: CalculatedStats }[];
  careerCounts: BattingCounts;
  careerStats: CalculatedStats;
}

// Turns the raw manual-entry rows into the shape the existing card
// components (PlayerCard / PlayerCardStatsBack) already know how to render
// — reusing the same battingAverage/OBP/SLG/OPS math as every other
// player in the app, just fed from typed-in numbers instead of Supabase.
export function computeLocalPlayerCardData(player: LocalPlayer): LocalPlayerCardData {
  const seasons = player.seasons.map((s) => {
    const counts = seasonToCounts(s);
    return { year: Number(s.year) || 0, season: s.season, teamName: s.team, counts, stats: calculateStats(counts) };
  });
  const careerCounts = aggregateBattingCounts(seasons.map((s) => s.counts));
  return { seasons, careerCounts, careerStats: calculateStats(careerCounts) };
}

// Defaults any fields added after a player was first saved (leagueName/
// divisionName/currentTeamName/photoUrl/teamLogoUrl) so an older on-device
// record doesn't come back with `undefined` in newly-added fields.
function normalize(p: LocalPlayer): LocalPlayer {
  return {
    ...p,
    leagueName: p.leagueName ?? "",
    divisionName: p.divisionName ?? "",
    currentTeamName: p.currentTeamName ?? "",
    currentSeason: p.currentSeason ?? "",
    currentSeasonYear: p.currentSeasonYear ?? "",
    photoUrl: p.photoUrl ?? null,
    teamLogoUrl: p.teamLogoUrl ?? null,
  };
}

async function readAll(): Promise<LocalPlayer[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalize) : [];
  } catch {
    return [];
  }
}

async function writeAll(players: LocalPlayer[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

export async function listLocalPlayers(): Promise<LocalPlayer[]> {
  return readAll();
}

export async function getLocalPlayer(id: string): Promise<LocalPlayer | null> {
  const all = await readAll();
  return all.find((p) => p.id === id) ?? null;
}

export async function saveLocalPlayer(player: LocalPlayer): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.id === player.id);
  if (idx >= 0) {
    all[idx] = player;
  } else {
    all.push(player);
  }
  await writeAll(all);
}

export async function deleteLocalPlayer(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((p) => p.id !== id));
}

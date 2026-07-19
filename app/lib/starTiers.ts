import type { BattingCounts } from "./stats";

// Spec Section 9: every category's star rating is derived purely from
// existing per-game counts, current-season only -- no new data to store,
// computed on read the same way AVG/OBP/SLG/OPS are. RBI has no star
// category (a batter can drive in a run without a hit -- sac fly, FC).

// Hits is the only category with a guaranteed default (1 star just for
// joining); the others show 0 (no star at all) until the first occurrence.
export function hitsStars(hits: number): number {
  if (hits >= 20) return 5;
  if (hits >= 13) return 4;
  if (hits >= 8) return 3;
  if (hits >= 3) return 2;
  return 1;
}

export function doublesStars(doubles: number): number {
  if (doubles >= 9) return 5;
  if (doubles >= 7) return 4;
  if (doubles >= 5) return 3;
  if (doubles >= 3) return 2;
  if (doubles >= 1) return 1;
  return 0;
}

// Rarer event, bigger jumps per occurrence -- no 1-star or 3-star tier exists.
export function triplesStars(triples: number): number {
  if (triples >= 3) return 5;
  if (triples >= 2) return 4;
  if (triples >= 1) return 2;
  return 0;
}

// Rarest event, biggest jumps -- only two tiers exist at all.
export function homeRunsStars(homeRuns: number): number {
  if (homeRuns >= 2) return 5;
  if (homeRuns >= 1) return 3;
  return 0;
}

export interface StarTiers {
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
}

export function calculateStarTiers(counts: Pick<BattingCounts, "h" | "doubles" | "triples" | "hr">): StarTiers {
  return {
    hits: hitsStars(counts.h),
    doubles: doublesStars(counts.doubles),
    triples: triplesStars(counts.triples),
    homeRuns: homeRunsStars(counts.hr),
  };
}

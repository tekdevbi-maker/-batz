export interface BattingCounts {
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  sf: number;
}

export const EMPTY_BATTING_COUNTS: BattingCounts = {
  ab: 0,
  h: 0,
  singles: 0,
  doubles: 0,
  triples: 0,
  hr: 0,
  rbi: 0,
  bb: 0,
  hbp: 0,
  sf: 0,
};

export function aggregateBattingCounts(lines: BattingCounts[]): BattingCounts {
  return lines.reduce((totals, line) => ({
    ab: totals.ab + line.ab,
    h: totals.h + line.h,
    singles: totals.singles + line.singles,
    doubles: totals.doubles + line.doubles,
    triples: totals.triples + line.triples,
    hr: totals.hr + line.hr,
    rbi: totals.rbi + line.rbi,
    bb: totals.bb + line.bb,
    hbp: totals.hbp + line.hbp,
    sf: totals.sf + line.sf,
  }), { ...EMPTY_BATTING_COUNTS });
}

export function totalBases(counts: BattingCounts): number {
  return counts.singles + counts.doubles * 2 + counts.triples * 3 + counts.hr * 4;
}

export function battingAverage(counts: BattingCounts): number {
  if (counts.ab === 0) return 0;
  return counts.h / counts.ab;
}

export function onBasePercentage(counts: BattingCounts): number {
  const denominator = counts.ab + counts.bb + counts.hbp + counts.sf;
  if (denominator === 0) return 0;
  return (counts.h + counts.bb + counts.hbp) / denominator;
}

export function sluggingPercentage(counts: BattingCounts): number {
  if (counts.ab === 0) return 0;
  return totalBases(counts) / counts.ab;
}

export function onBasePlusSlugging(counts: BattingCounts): number {
  return onBasePercentage(counts) + sluggingPercentage(counts);
}

export interface CalculatedStats {
  avg: number;
  obp: number;
  slg: number;
  ops: number;
}

export function calculateStats(counts: BattingCounts): CalculatedStats {
  return {
    avg: battingAverage(counts),
    obp: onBasePercentage(counts),
    slg: sluggingPercentage(counts),
    ops: onBasePlusSlugging(counts),
  };
}

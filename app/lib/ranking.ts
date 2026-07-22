// "Standard competition ranking" (1-2-2-4): tied entries share the same
// rank, and the next distinct rank skips ahead by the number of entries
// tied at the rank above it -- e.g. two players tied for 5th means the
// next player is ranked 7th, not 6th. `sorted` must already be sorted
// descending by `value`.
export function computeStandardCompetitionRanks<T>(sorted: T[], value: (item: T) => number): number[] {
  const ranks: number[] = [];
  sorted.forEach((item, i) => {
    ranks.push(i > 0 && value(item) === value(sorted[i - 1]) ? ranks[i - 1] : i + 1);
  });
  return ranks;
}

// One-line explanation shown under the category tabs on both leaderboards.
// Raw counting stats get a plain description; calculated stats spell out
// the formula (matching the exact derivation in lib/stats.ts) so a parent
// unfamiliar with the metric can see how it's built.
export const STAT_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  hits: "Total hits this season.",
  doubles: "Total doubles this season.",
  triples: "Total triples this season.",
  hr: "Total home runs this season.",
  rbi: "Total runs batted in this season.",
  bb: "Total walks this season.",
  avg: "Batting Average = Hits ÷ At-Bats",
  obp: "On-Base Percentage = (Hits + Walks + Hit-By-Pitch) ÷ (At-Bats + Walks + Hit-By-Pitch + Sac Flies)",
  slg: "Slugging Percentage = Total Bases ÷ At-Bats",
  ops: "OPS = On-Base Percentage + Slugging Percentage",
};

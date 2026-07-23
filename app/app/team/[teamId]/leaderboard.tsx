import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";
import { hitsStars, doublesStars, triplesStars, homeRunsStars } from "../../../lib/starTiers";
import { computeStandardCompetitionRanks } from "../../../lib/ranking";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";
import CategoryTabs from "../../../components/CategoryTabs";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

// spec Section 8: Hits, Doubles, Triples, HR, RBI, AVG, OBP, SLG, OPS,
// Walks -- strikeouts and HBP deliberately excluded (not meaningful
// "rank favorably by" stats).
const CATEGORIES = [
  { key: "hits", label: "Hits", value: (r: RosterSeasonStats) => r.counts.h, format: (n: number) => String(n) },
  { key: "doubles", label: "2B", value: (r: RosterSeasonStats) => r.counts.doubles, format: (n: number) => String(n) },
  { key: "triples", label: "3B", value: (r: RosterSeasonStats) => r.counts.triples, format: (n: number) => String(n) },
  { key: "hr", label: "HR", value: (r: RosterSeasonStats) => r.counts.hr, format: (n: number) => String(n) },
  { key: "rbi", label: "RBI", value: (r: RosterSeasonStats) => r.counts.rbi, format: (n: number) => String(n) },
  { key: "avg", label: "AVG", value: (r: RosterSeasonStats) => r.stats.avg, format: fmt },
  { key: "obp", label: "OBP", value: (r: RosterSeasonStats) => r.stats.obp, format: fmt },
  { key: "slg", label: "SLG", value: (r: RosterSeasonStats) => r.stats.slg, format: fmt },
  { key: "ops", label: "OPS", value: (r: RosterSeasonStats) => r.stats.ops, format: fmt },
  { key: "bb", label: "Walks", value: (r: RosterSeasonStats) => r.counts.bb, format: (n: number) => String(n) },
] as const;

// Stars reflect the *selected* category only: Hits/2B/3B/HR each have their
// own tiers; RBI/AVG/OBP/SLG/OPS/Walks have no star rating, so they show none.
function starsFor(categoryKey: (typeof CATEGORIES)[number]["key"], r: RosterSeasonStats): string {
  let tier = 0;
  if (categoryKey === "hits") tier = hitsStars(r.counts.h);
  else if (categoryKey === "doubles") tier = doublesStars(r.counts.doubles);
  else if (categoryKey === "triples") tier = triplesStars(r.counts.triples);
  else if (categoryKey === "hr") tier = homeRunsStars(r.counts.hr);
  return tier > 0 ? "⭐".repeat(tier) : "";
}

export default function TeamLeaderboardScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [roster, setRoster] = useState<RosterSeasonStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<(typeof CATEGORIES)[number]["key"]>("hits");

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamRosterWithSeasonStats(supabase, teamId).then(setRoster).catch((err) => setError(errorMessage(err)));
  }, [teamId, session]);

  const category = CATEGORIES.find((c) => c.key === categoryKey)!;
  const sorted = useMemo(() => [...roster].sort((a, b) => category.value(b) - category.value(a)), [roster, category]);
  const ranks = useMemo(() => computeStandardCompetitionRanks(sorted, category.value), [sorted, category]);

  if (!session || !teamId) return null;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Team Leaderboard</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        <CategoryTabs categories={CATEGORIES} selectedKey={categoryKey} onSelect={setCategoryKey} />

        {sorted.map((r, i) => (
          <Pressable
            key={r.rosterEntryId}
            style={styles.row}
            disabled={!r.playerId}
            onPress={() => r.playerId && router.push(`/player/${r.playerId}`)}
          >
            <Text style={styles.rank}>{ranks[i]}.</Text>
            <Text style={styles.uniformNumber}>#{r.uniformNumber}</Text>
            <Text style={styles.name}>
              {r.playerId ? r.displayName : ""} {starsFor(categoryKey, r)}
            </Text>
            <Text style={styles.value}>{category.format(category.value(r))}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="leaderboard" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  rank: { width: 24, color: colors.textSecondary, fontSize: 14 },
  uniformNumber: { width: 40, color: colors.textSecondary, fontSize: 14 },
  name: { flex: 1, fontSize: 15, color: colors.textPrimary },
  value: { fontWeight: "600", fontSize: 15, color: colors.textPrimary },
});

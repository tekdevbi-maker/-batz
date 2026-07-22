import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getDivisionLeaderboard, type DivisionLeaderboardEntry } from "../../../lib/statsRepository";
import { calculateStarTiers } from "../../../lib/starTiers";
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

// spec Section 8: same category set as the Team Leaderboard.
const CATEGORIES = [
  { key: "hits", label: "Hits", value: (r: DivisionLeaderboardEntry) => r.counts.h, format: (n: number) => String(n) },
  { key: "doubles", label: "2B", value: (r: DivisionLeaderboardEntry) => r.counts.doubles, format: (n: number) => String(n) },
  { key: "triples", label: "3B", value: (r: DivisionLeaderboardEntry) => r.counts.triples, format: (n: number) => String(n) },
  { key: "hr", label: "HR", value: (r: DivisionLeaderboardEntry) => r.counts.hr, format: (n: number) => String(n) },
  { key: "rbi", label: "RBI", value: (r: DivisionLeaderboardEntry) => r.counts.rbi, format: (n: number) => String(n) },
  { key: "avg", label: "AVG", value: (r: DivisionLeaderboardEntry) => r.stats.avg, format: fmt },
  { key: "obp", label: "OBP", value: (r: DivisionLeaderboardEntry) => r.stats.obp, format: fmt },
  { key: "slg", label: "SLG", value: (r: DivisionLeaderboardEntry) => r.stats.slg, format: fmt },
  { key: "ops", label: "OPS", value: (r: DivisionLeaderboardEntry) => r.stats.ops, format: fmt },
  { key: "bb", label: "Walks", value: (r: DivisionLeaderboardEntry) => r.counts.bb, format: (n: number) => String(n) },
] as const;

// spec Section 8: League/Division leaderboard is capped at Top 25 (unlike
// the uncapped Team Leaderboard -- a whole division has too many players
// for "everyone" to be a useful ranked view).
const TOP_N = 25;

function starsFor(r: DivisionLeaderboardEntry): string {
  const tiers = calculateStarTiers(r.counts);
  const best = Math.max(tiers.hits, tiers.doubles, tiers.triples, tiers.homeRuns);
  return best > 0 ? "⭐".repeat(best) : "";
}

export default function LeagueLeaderboardScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [entries, setEntries] = useState<DivisionLeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<(typeof CATEGORIES)[number]["key"]>("hits");

  useEffect(() => {
    if (!teamId || !session) return;
    getDivisionLeaderboard(supabase, teamId).then(setEntries).catch((err) => setError(errorMessage(err)));
  }, [teamId, session]);

  const category = CATEGORIES.find((c) => c.key === categoryKey)!;
  const sorted = useMemo(
    () => [...entries].sort((a, b) => category.value(b) - category.value(a)).slice(0, TOP_N),
    [entries, category]
  );
  const ranks = useMemo(() => computeStandardCompetitionRanks(sorted, category.value), [sorted, category]);

  if (!session || !teamId) return null;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.title}>League Leaderboard</Text>
        <Text style={styles.hint}>Top {TOP_N} in your division, current season.</Text>
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
              {r.playerId ? r.displayName : ""} {starsFor(r)}
            </Text>
            <Text style={styles.teamName}>{r.teamName}</Text>
            <Text style={styles.value}>{category.format(category.value(r))}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="league-leaderboard" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
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
  name: { flex: 1.2, fontSize: 15, color: colors.textPrimary },
  teamName: { flex: 1, fontSize: 13, color: colors.textSecondary },
  value: { fontWeight: "600", fontSize: 15, color: colors.textPrimary },
});

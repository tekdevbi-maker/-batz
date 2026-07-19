import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";
import { calculateStarTiers } from "../../../lib/starTiers";

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

function starsFor(r: RosterSeasonStats): string {
  const tiers = calculateStarTiers(r.counts);
  const best = Math.max(tiers.hits, tiers.doubles, tiers.triples, tiers.homeRuns);
  return best > 0 ? "⭐".repeat(best) : "";
}

export default function TeamLeaderboardScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [roster, setRoster] = useState<RosterSeasonStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<(typeof CATEGORIES)[number]["key"]>("avg");

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamRosterWithSeasonStats(supabase, teamId).then(setRoster).catch((err) => setError(errorMessage(err)));
  }, [teamId, session]);

  const category = CATEGORIES.find((c) => c.key === categoryKey)!;
  const sorted = useMemo(() => [...roster].sort((a, b) => category.value(b) - category.value(a)), [roster, category]);

  if (!session || !teamId) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Team Leaderboard</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            style={[styles.chip, categoryKey === c.key && styles.chipSelected]}
            onPress={() => setCategoryKey(c.key)}
          >
            <Text>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      {sorted.map((r, i) => (
        <Pressable
          key={r.rosterEntryId}
          style={styles.row}
          disabled={!r.playerId}
          onPress={() => r.playerId && router.push(`/player/${r.playerId}`)}
        >
          <Text style={styles.rank}>{i + 1}.</Text>
          <View style={styles.rowMain}>
            <Text style={styles.name}>
              #{r.uniformNumber} {r.displayName} {starsFor(r)}
            </Text>
          </View>
          <Text style={styles.value}>{category.format(category.value(r))}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  error: { color: "#b91c1c", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 4, paddingHorizontal: 10 },
  chipSelected: { backgroundColor: "#dbeafe", borderColor: "#1d4ed8" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  rank: { width: 24, color: "#888", fontSize: 13 },
  rowMain: { flex: 1 },
  name: { fontSize: 14 },
  value: { fontWeight: "600", fontSize: 14 },
});

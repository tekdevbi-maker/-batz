import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

export default function RosterScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [roster, setRoster] = useState<RosterSeasonStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamRosterWithSeasonStats(supabase, teamId).then(setRoster).catch((err) => setError(errorMessage(err)));
  }, [teamId, session]);

  if (!session || !teamId) return null;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Roster -- Season Stats</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {roster.length === 0 && !error && <Text style={styles.hint}>No roster yet.</Text>}
        {roster.map((r) => (
          <Pressable
            key={r.rosterEntryId}
            style={styles.rosterRow}
            disabled={!r.playerId}
            onPress={() => r.playerId && router.push(`/player/${r.playerId}`)}
          >
            <Text style={styles.playerTag}>
              #{r.uniformNumber} {r.displayName}
              {r.playerId ? "  ›" : ""}
            </Text>
            <Text style={styles.statLine}>
              AB {r.counts.ab} -- H {r.counts.h} -- AVG {fmt(r.stats.avg)} -- OBP {fmt(r.stats.obp)} -- SLG{" "}
              {fmt(r.stats.slg)} -- OPS {fmt(r.stats.ops)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="roster" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  hint: { color: colors.textSecondary, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
  rosterRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  playerTag: { fontWeight: "600", fontSize: 14, color: colors.textPrimary },
  statLine: { fontSize: 12, color: colors.textSecondary },
});

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
        <Text style={styles.title}>Roster</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {roster.length === 0 && !error && <Text style={styles.hint}>No roster yet.</Text>}

        <View style={styles.grid}>
          {roster.map((r) => (
            <Pressable
              key={r.rosterEntryId}
              style={[styles.card, !r.playerId && styles.cardUnclaimed]}
              disabled={!r.playerId}
              onPress={() => r.playerId && router.push(`/player/${r.playerId}`)}
            >
              <Text style={styles.cardNumber}>#{r.uniformNumber}</Text>
              <Text style={styles.cardName} numberOfLines={2}>
                {r.playerId ? r.displayName : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <TeamTabBar teamId={teamId} active="roster" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  hint: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  card: {
    width: "31.5%",
    aspectRatio: 0.72,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    marginBottom: 12,
  },
  cardUnclaimed: {
    borderColor: colors.border,
    opacity: 0.6,
  },
  cardNumber: { fontSize: 33, fontWeight: "800", color: colors.textPrimary },
  cardName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: 8,
  },
});

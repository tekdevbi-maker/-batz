import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, type TeamJoinContext } from "../../../lib/claimRepository";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

export default function TeamOverviewScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [roster, setRoster] = useState<RosterSeasonStats[]>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err)));
    getTeamRosterWithSeasonStats(supabase, teamId).then(setRoster).catch((err) => setError(errorMessage(err)));
    supabase
      .from("coach_assignment")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsCoach(!!data));
  }, [teamId, session]);

  if (!session || !teamId) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {context && (
        <>
          <Text style={styles.title}>{context.teamName}</Text>
          <Text style={styles.hint}>
            {context.leagueName}, {context.divisionName} -- {context.season} {context.year}
          </Text>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push(`/team/${teamId}/games`)}>
          <Text>Game Log</Text>
        </Pressable>
        {isCoach && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}
          >
            <Text>Import a Game</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.label}>Season Stats</Text>
      {roster.length === 0 && <Text style={styles.hint}>No roster yet.</Text>}
      {roster.map((r) => (
        <View key={r.rosterEntryId} style={styles.rosterRow}>
          <Text style={styles.playerTag}>
            #{r.uniformNumber} {r.displayName}
          </Text>
          <Text style={styles.statLine}>
            AB {r.counts.ab} -- H {r.counts.h} -- AVG {fmt(r.stats.avg)} -- OBP {fmt(r.stats.obp)} -- SLG{" "}
            {fmt(r.stats.slg)} -- OPS {fmt(r.stats.ops)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  hint: { color: "#555", fontSize: 13, marginBottom: 8 },
  error: { color: "#b91c1c", fontSize: 13 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 16 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  rosterRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 2,
  },
  playerTag: { fontWeight: "600", fontSize: 14 },
  statLine: { fontSize: 12, color: "#444" },
});

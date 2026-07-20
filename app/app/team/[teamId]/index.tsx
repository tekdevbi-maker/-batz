import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, type TeamJoinContext } from "../../../lib/claimRepository";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";
import { listTeamCoaches, type TeamCoach } from "../../../lib/coachesRepository";

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
  const [coaches, setCoaches] = useState<TeamCoach[]>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err)));
    getTeamRosterWithSeasonStats(supabase, teamId).then(setRoster).catch((err) => setError(errorMessage(err)));
    listTeamCoaches(supabase, teamId).then(setCoaches).catch(() => {});
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
        <Pressable style={styles.secondaryButton} onPress={() => router.push(`/team/${teamId}/leaderboard`)}>
          <Text>Leaderboard</Text>
        </Pressable>
        {isCoach && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}
          >
            <Text>Import a Game</Text>
          </Pressable>
        )}
        {!isCoach && (
          <Pressable style={styles.secondaryButton} onPress={() => router.push(`/team/${teamId}/customer-care`)}>
            <Text>Customer Care</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.label}>Coaches ({coaches.length}/4)</Text>
      {coaches.map((c) => (
        <Text key={c.userId} style={styles.statLine}>
          {c.firstName} {c.lastName} -- {c.role}
        </Text>
      ))}
      {isCoach && coaches.length < 4 && (
        <>
          <Text style={styles.label}>Share this with an assistant coach:</Text>
          <Text selectable style={styles.code}>
            {Linking.createURL(`/coach-join/${teamId}`)}
          </Text>
        </>
      )}

      <Text style={styles.label}>Season Stats</Text>
      {roster.length === 0 && <Text style={styles.hint}>No roster yet.</Text>}
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
  code: {
    fontFamily: "monospace",
    backgroundColor: "#f3f4f6",
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
});

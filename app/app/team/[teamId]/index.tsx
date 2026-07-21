import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, type TeamJoinContext } from "../../../lib/claimRepository";
import { listTeamCoaches, type TeamCoach } from "../../../lib/coachesRepository";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function TeamHomeScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [coaches, setCoaches] = useState<TeamCoach[]>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !session) return;
    getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err)));
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
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
            <Text style={styles.buttonText}>Game Log</Text>
          </Pressable>
          {isCoach && (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}
            >
              <Text style={styles.buttonText}>Import a Game</Text>
            </Pressable>
          )}
          {!isCoach && (
            <Pressable style={styles.secondaryButton} onPress={() => router.push(`/team/${teamId}/customer-care`)}>
              <Text style={styles.buttonText}>Customer Care</Text>
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
      </ScrollView>
      <TeamTabBar teamId={teamId} active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  error: { color: colors.error, fontSize: 13 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 16, color: colors.textPrimary },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  buttonText: { color: colors.textPrimary },
  statLine: { fontSize: 12, color: colors.textSecondary },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
});

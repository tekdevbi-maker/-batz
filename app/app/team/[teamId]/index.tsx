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

        <View style={styles.tileGrid}>
          <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/games`)}>
            <View style={styles.tileInner}>
              <Text style={styles.tileText}>Game Log</Text>
            </View>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => router.push("/search")}>
            <View style={styles.tileInner}>
              <Text style={styles.tileText}>Find a Player</Text>
            </View>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => router.push("/activity")}>
            <View style={styles.tileInner}>
              <Text style={styles.tileText}>Activity Feed</Text>
            </View>
          </Pressable>
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/claim-player`)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Claim a Player</Text>
              </View>
            </Pressable>
          )}
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/settings`)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Team Settings</Text>
              </View>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <TeamTabBar teamId={teamId} active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
  error: { color: colors.error, fontSize: 14 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 16, color: colors.textPrimary },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8, rowGap: 8 },
  tile: {
    width: "23%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 4,
  },
  // A plain Text centered directly by the Pressable's own alignItems/
  // justifyContent rendered bottom-heavy on Android for wrapped labels
  // (confirmed by temporarily highlighting the Text's own box -- it sat
  // flush against the tile's bottom edge instead of centered). An
  // explicit flex:1 wrapper that centers its own content is unambiguous
  // and fixes it.
  tileInner: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  tileText: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    includeFontPadding: false,
  },
  statLine: { fontSize: 13, color: colors.textSecondary },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
});

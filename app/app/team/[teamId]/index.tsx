import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, countPendingClaimRequests, type TeamJoinContext } from "../../../lib/claimRepository";
import { listTeamCoaches, type TeamCoach } from "../../../lib/coachesRepository";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";
import CopyableLink from "../../../components/CopyableLink";

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
  const [pendingClaimCount, setPendingClaimCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!teamId || !session) return;
    await Promise.all([
      getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err))),
      listTeamCoaches(supabase, teamId).then(setCoaches).catch(() => {}),
      supabase
        .from("coach_assignment")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setIsCoach(!!data);
          if (data) {
            return countPendingClaimRequests(supabase, teamId).then(setPendingClaimCount).catch(() => {});
          }
        }),
    ]);
  }, [teamId, session]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!session || !teamId) return null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        {context && (
          <>
            <Text style={styles.title}>{context.teamName}</Text>
            <Text style={styles.hint}>
              {context.leagueName} | {context.divisionName} | {context.season} {context.year}
            </Text>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {isCoach && (
          <>
            <Text style={styles.label}>Team Join Link</Text>
            <CopyableLink value={Linking.createURL(`/join/${teamId}`)} />
          </>
        )}

        <Text style={styles.label}>Coaches ({coaches.length}/4)</Text>
        {(() => {
          const headCoach = coaches.find((c) => c.role === "primary");
          const assistants = coaches.filter((c) => c.role === "assistant");
          return (
            <>
              <Text style={styles.statLine}>
                Head Coach: {headCoach ? `${headCoach.firstName} ${headCoach.lastName}` : ""}
              </Text>
              <Text style={styles.statLine}>
                Assistant Coaches: {assistants.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}
              </Text>
            </>
          );
        })()}

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
            <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/settings`)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Team Settings</Text>
              </View>
            </Pressable>
          )}
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/members`)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Team Members</Text>
              </View>
              {pendingClaimCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingClaimCount}</Text>
                </View>
              )}
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
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 8 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 16, color: colors.textPrimary },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8, rowGap: 8 },
  tile: {
    width: "23%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 4,
    position: "relative",
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
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    includeFontPadding: false,
  },
  statLine: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "white", fontSize: 11, fontFamily: "Montserrat_700Bold" },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
});

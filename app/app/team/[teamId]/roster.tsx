import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamRosterWithSeasonStats, type RosterSeasonStats } from "../../../lib/statsRepository";
import { getTeamJoinContext, type TeamJoinContext } from "../../../lib/claimRepository";
import { isCoachOnTeam } from "../../../lib/teamsRepository";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";
import PlayerCard from "../../../components/PlayerCard";

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
  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!teamId || !session) return;
    const viewerIsCoach = await isCoachOnTeam(supabase, teamId, session.user.id);
    await Promise.all([
      getTeamRosterWithSeasonStats(supabase, teamId, viewerIsCoach)
        .then(setRoster)
        .catch((err) => setError(errorMessage(err))),
      getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err))),
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
        {roster.length === 0 && !error && <Text style={styles.hint}>No roster yet.</Text>}

        <View style={styles.grid}>
          {roster.map((r) =>
            r.playerId ? (
              <Pressable
                key={r.rosterEntryId}
                style={styles.photoCard}
                onPress={() => router.push(`/player/${r.playerId}`)}
              >
                <PlayerCard
                  // Real name only when the parent opted into "Real Name"
                  // display -- otherwise the card falls back to the same
                  // alias/uniform tag shown everywhere else (displayName),
                  // never the real name, matching the privacy setting.
                  // A locked (coach-fallback) player has no real name on
                  // file at all, so it always shows the roster alias.
                  firstName={!r.isCoachFallback && r.displayMode === "real_name" ? (r.firstName ?? "") : ""}
                  lastName={!r.isCoachFallback && r.displayMode === "real_name" ? (r.lastName ?? "") : r.displayName}
                  photoUrl={r.photoUrl}
                  teamLogoUrl={context?.teamLogoUrl}
                />
              </Pressable>
            ) : (
              <Pressable key={r.rosterEntryId} style={[styles.card, styles.cardUnclaimed]} disabled>
                <Text style={styles.cardNumber}>#{r.uniformNumber}</Text>
                <Text style={styles.cardName} numberOfLines={2} />
              </Pressable>
            )
          )}
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
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 4 },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
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
  photoCard: {
    width: "31.5%",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardNumber: { fontSize: 33, fontFamily: "Montserrat_800ExtraBold", color: colors.textPrimary },
  cardName: {
    fontSize: 14,
    fontFamily: "Montserrat_600SemiBold",
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: 8,
  },
});

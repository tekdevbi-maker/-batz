import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listAllMyCoachedTeams, listAllMyPreviousCoachedTeams, type CoachedTeam } from "../lib/teamsRepository";
import { colors } from "../lib/theme";

function byMostRecentFirst(teams: CoachedTeam[]): CoachedTeam[] {
  return [...teams].sort((a, b) => b.year - a.year);
}

// Landing point for a CSV opened from outside the app (OS "Open With
// @Batz", spec Section 3a). We know the file's URI but not which team it
// belongs to -- always make the coach explicitly confirm the destination
// team here (never auto-pick, even with only one team) so a wrong-team
// import can't happen silently, then hand off to the existing Import a
// Game screen, which does the actual parsing/import. Ended-season teams
// are offered too (a Head Coach backfilling a completed season's stats),
// just under a separate "Previous Teams" section below the current ones.
export default function SharedCsvScreen() {
  const { session } = useRequireAuth();
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();

  const [currentTeams, setCurrentTeams] = useState<CoachedTeam[] | null>(null);
  const [previousTeams, setPreviousTeams] = useState<CoachedTeam[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    Promise.all([
      listAllMyCoachedTeams(supabase, session.user.id),
      listAllMyPreviousCoachedTeams(supabase, session.user.id),
    ])
      .then(([current, previous]) => {
        setCurrentTeams(byMostRecentFirst(current));
        setPreviousTeams(byMostRecentFirst(previous));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [session]);

  if (!session) return null;

  if (!uri) {
    return (
      <View style={styles.container}>
        <Text style={styles.plainText}>No file was shared.</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Couldn't load your teams: {loadError}</Text>
      </View>
    );
  }

  if (!currentTeams || !previousTeams) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (currentTeams.length === 0 && previousTeams.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.plainText}>You're not coaching any team, so there's nowhere to import this file into.</Text>
      </View>
    );
  }

  function goToTeam(teamId: string) {
    router.replace({
      pathname: "/import-game",
      params: { teamId, incomingFileUri: uri },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Which team is this game for?</Text>
      {currentTeams.map((team) => (
        <Pressable key={team.id} style={styles.teamRow} onPress={() => goToTeam(team.id)}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>
            {team.season} {team.year}
          </Text>
        </Pressable>
      ))}

      {previousTeams.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Previous Teams</Text>
          {previousTeams.map((team) => (
            <Pressable key={team.id} style={styles.teamRow} onPress={() => goToTeam(team.id)}>
              <Text style={styles.teamName}>{team.name}</Text>
              <Text style={styles.teamMeta}>
                {team.season} {team.year}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, gap: 8, backgroundColor: colors.background },
  label: { fontSize: 18, fontFamily: "Montserrat_600SemiBold", marginBottom: 8, color: colors.textPrimary },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "Montserrat_600SemiBold",
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 4,
  },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  teamRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  teamName: { fontSize: 18, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  teamMeta: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
});

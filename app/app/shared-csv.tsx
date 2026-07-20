import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, type CoachedTeam } from "../lib/teamsRepository";

// Landing point for a CSV opened from outside the app (OS "Open With
// @Batz", spec Section 3a). We know the file's URI but not which team it
// belongs to -- resolve that here, then hand off to the existing Import a
// Game screen, which does the actual parsing/import.
export default function SharedCsvScreen() {
  const { session } = useRequireAuth();
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();

  const [teams, setTeams] = useState<CoachedTeam[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listMyCoachedTeams(supabase, session.user.id)
      .then(setTeams)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [session]);

  useEffect(() => {
    if (!teams || !uri) return;
    if (teams.length === 1) {
      router.replace({
        pathname: "/import-game",
        params: { teamId: teams[0].id, incomingFileUri: uri },
      });
    }
  }, [teams, uri, router]);

  if (!session) return null;

  if (!uri) {
    return (
      <View style={styles.container}>
        <Text>No file was shared.</Text>
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

  if (!teams) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (teams.length === 0) {
    return (
      <View style={styles.container}>
        <Text>
          You're not coaching any in-season team, so there's nowhere to import this file into.
        </Text>
      </View>
    );
  }

  if (teams.length === 1) {
    // Redirect effect above is about to fire -- avoid a flash of the picker.
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Which team is this game for?</Text>
      {teams.map((team) => (
        <Pressable
          key={team.id}
          style={styles.teamRow}
          onPress={() =>
            router.replace({
              pathname: "/import-game",
              params: { teamId: team.id, incomingFileUri: uri },
            })
          }
        >
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>
            {team.season} {team.year}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 8 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  error: { color: "#b91c1c", fontSize: 13 },
  teamRow: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  teamName: { fontSize: 16, fontWeight: "600" },
  teamMeta: { color: "#555", fontSize: 13 },
});

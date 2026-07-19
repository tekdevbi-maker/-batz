import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getPlayerProfile, type PlayerProfile } from "../../../lib/playerRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

export default function PlayerProfileScreen() {
  const { session } = useRequireAuth();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!playerId || !session) return;
    getPlayerProfile(supabase, playerId, session.user.id)
      .then((p) => {
        setProfile(p);
        setLoaded(true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoaded(true);
      });
  }, [playerId, session]);

  // Re-fetch on focus so settings changes (tag/visibility) show immediately
  // when navigating back from the settings screen.
  useFocusEffect(load);

  if (!session || !playerId) return null;

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    // Nonexistent and not-visible-to-you are deliberately the same state.
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Player not available</Text>
        <Text style={styles.hint}>
          This player doesn't exist, or their profile is set to Private and isn't visible to you.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{profile.displayName}</Text>
      {profile.displayName !== profile.playerTag && <Text style={styles.hint}>{profile.playerTag}</Text>}
      {profile.isOwner && (
        <View style={styles.ownerRow}>
          <Text style={profile.visibilityScope === "private" ? styles.privateBadge : styles.publicBadge}>
            {profile.visibilityScope}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.push(`/player/${playerId}/settings`)}>
            <Text>Settings</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.label}>Career</Text>
      <Text style={styles.statLine}>
        AB {profile.careerCounts.ab} -- H {profile.careerCounts.h} -- 2B {profile.careerCounts.doubles} -- 3B{" "}
        {profile.careerCounts.triples} -- HR {profile.careerCounts.hr} -- RBI {profile.careerCounts.rbi}
      </Text>
      <Text style={styles.statLine}>
        AVG {fmt(profile.careerStats.avg)} -- OBP {fmt(profile.careerStats.obp)} -- SLG{" "}
        {fmt(profile.careerStats.slg)} -- OPS {fmt(profile.careerStats.ops)}
      </Text>

      <Text style={styles.label}>Seasons</Text>
      {profile.seasons.length === 0 && <Text style={styles.hint}>No seasons recorded yet.</Text>}
      {profile.seasons.map((s) => (
        <Pressable key={s.rosterEntryId} style={styles.seasonRow} onPress={() => router.push(`/team/${s.teamId}`)}>
          <Text style={styles.seasonTitle}>
            {s.teamName} #{s.uniformNumber} -- {s.season} {s.year}
            {s.seasonStatus === "ended" ? " (ended)" : ""}
          </Text>
          <Text style={styles.hint}>
            {s.leagueName}, {s.divisionName}
          </Text>
          <Text style={styles.statLine}>
            AB {s.counts.ab} -- H {s.counts.h} -- AVG {fmt(s.stats.avg)} -- OBP {fmt(s.stats.obp)} -- SLG{" "}
            {fmt(s.stats.slg)} -- OPS {fmt(s.stats.ops)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 6 },
  title: { fontSize: 22, fontWeight: "700" },
  hint: { color: "#555", fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 16 },
  statLine: { fontSize: 13, color: "#444" },
  ownerRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  publicBadge: { color: "#15803d", backgroundColor: "#dcfce7", paddingHorizontal: 8, borderRadius: 4 },
  privateBadge: { color: "#92400e", backgroundColor: "#fef3c7", paddingHorizontal: 8, borderRadius: 4 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  seasonRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 2,
  },
  seasonTitle: { fontWeight: "600", fontSize: 14 },
});

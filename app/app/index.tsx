import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from "react-native";
import { Link, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, listMyMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import { listMyPlayers, type MyPlayer } from "../lib/playerRepository";
import { colors } from "../lib/theme";

export default function Home() {
  const router = useRouter();
  const { session, isAdmin, signOut } = useRequireAuth();
  const [coachedTeams, setCoachedTeams] = useState<CoachedTeam[]>([]);
  const [memberTeams, setMemberTeams] = useState<CoachedTeam[]>([]);
  const [myPlayers, setMyPlayers] = useState<MyPlayer[]>([]);

  useEffect(() => {
    if (!session) return;
    listMyCoachedTeams(supabase, session.user.id).then(setCoachedTeams).catch(() => {});
    listMyMemberTeams(supabase, session.user.id).then(setMemberTeams).catch(() => {});
    listMyPlayers(supabase, session.user.id).then(setMyPlayers).catch(() => {});
  }, [session]);

  if (!session) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Image source={require("../assets/wordmark-transparent.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.hint}>Signed in as {session?.user.email}</Text>

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/search")}>
          <Text style={styles.buttonText}>Find a Player</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/activity")}>
          <Text style={styles.buttonText}>Activity Feed</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/customer-care")}>
          <Text style={styles.buttonText}>Customer Care</Text>
        </Pressable>
      </View>

      {coachedTeams.length > 0 && (
        <>
          <Text style={styles.label}>Teams You Coach</Text>
          {coachedTeams.map((team) => (
            <Pressable key={team.id} style={styles.secondaryButton} onPress={() => router.push(`/team/${team.id}`)}>
              <Text style={styles.buttonText}>
                {team.name} ({team.season} {team.year}) -- Coach
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {memberTeams.length > 0 && (
        <>
          <Text style={styles.label}>Teams Your Player Is On</Text>
          {memberTeams.map((team) => (
            <Pressable key={team.id} style={styles.secondaryButton} onPress={() => router.push(`/team/${team.id}`)}>
              <Text style={styles.buttonText}>
                {team.name} ({team.season} {team.year}) -- Parent
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {myPlayers.length > 0 && (
        <>
          <Text style={styles.label}>Your Players</Text>
          {myPlayers.map((p) => (
            <Pressable key={p.playerId} style={styles.secondaryButton} onPress={() => router.push(`/player/${p.playerId}`)}>
              <Text style={styles.buttonText}>
                {p.displayName} {p.visibilityScope === "private" ? "(private)" : ""}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {isAdmin && (
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/admin")}>
          <Text style={styles.buttonText}>League/Division Admin</Text>
        </Pressable>
      )}

      <Pressable style={styles.secondaryButton} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.footerLinks}>
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link>
        {"  ·  "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12 },
  logo: { width: 220, height: 98 },
  hint: { color: colors.textSecondary },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  buttonText: { color: colors.textPrimary, fontWeight: "600", fontSize: 18 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footerLinks: { marginTop: 16, textAlign: "center", fontSize: 13, color: colors.textSecondary },
  legalLink: { color: colors.accent },
});

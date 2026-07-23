import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from "react-native";
import { Link, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, listMyMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import { listMyPlayers, type MyPlayer } from "../lib/playerRepository";
import { colors } from "../lib/theme";

interface TeamCard extends CoachedTeam {
  role: string;
}

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

  // Coach and member teams shown under one flat "Teams" grid -- a user can
  // be both on the same team, so dedupe by id while combining their roles
  // rather than rendering the same team twice.
  const roleByTeamId = new Map<string, Set<string>>();
  for (const t of coachedTeams) roleByTeamId.set(t.id, (roleByTeamId.get(t.id) ?? new Set()).add("Coach"));
  for (const t of memberTeams) roleByTeamId.set(t.id, (roleByTeamId.get(t.id) ?? new Set()).add("Parent"));
  const teamById = new Map<string, CoachedTeam>();
  for (const t of [...coachedTeams, ...memberTeams]) teamById.set(t.id, t);
  const teamCards: TeamCard[] = Array.from(teamById.values()).map((t) => ({
    ...t,
    role: Array.from(roleByTeamId.get(t.id) ?? []).join(" & "),
  }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Image source={require("../assets/wordmark-transparent.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.hint}>Signed in as {session?.user.email}</Text>

      {teamCards.length > 0 && (
        <>
          <Text style={styles.label}>Teams</Text>
          <View style={styles.tileGrid}>
            {teamCards.map((team) => (
              <Pressable key={team.id} style={styles.teamTile} onPress={() => router.push(`/team/${team.id}`)}>
                <Text style={styles.teamName} numberOfLines={2}>
                  {team.name}
                </Text>
                {team.divisionName ? <Text style={styles.teamMeta}>{team.divisionName}</Text> : null}
                <Text style={styles.teamMeta}>
                  {team.season} {team.year}
                </Text>
                <Text style={styles.teamRole}>{team.role}</Text>
              </Pressable>
            ))}
          </View>
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

      <View style={styles.spacer} />

      <Pressable style={styles.secondaryButton} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.footerLinks}>
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link>
        {"  ·  "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>
        {"  ·  "}
        <Link href="/customer-care"><Text style={styles.legalLink}>Need Help?</Text></Link>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12, flexGrow: 1 },
  logo: { width: 220, height: 98, alignSelf: "center" },
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
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  teamTile: {
    width: "48%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    marginBottom: 12,
  },
  teamName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  teamMeta: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 3 },
  teamRole: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 8 },
  spacer: { flex: 1 },
  footerLinks: { textAlign: "center", fontSize: 13, color: colors.textSecondary },
  legalLink: { color: colors.accent },
});

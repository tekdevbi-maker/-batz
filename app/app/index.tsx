import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, listMyMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import { listMyPlayers, type MyPlayer } from "../lib/playerRepository";

export default function Home() {
  const router = useRouter();
  const { session, isAdmin, signOut } = useRequireAuth();
  const [teamId, setTeamId] = useState("");
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>@Batz</Text>
      <Text style={styles.hint}>Signed in as {session?.user.email}</Text>

      {coachedTeams.length > 0 && (
        <>
          <Text style={styles.label}>Teams You Coach</Text>
          {coachedTeams.map((team) => (
            <Pressable key={team.id} style={styles.secondaryButton} onPress={() => router.push(`/team/${team.id}`)}>
              <Text>
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
              <Text>
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
              <Text>
                {p.displayName} {p.visibilityScope === "private" ? "(private)" : ""}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {isAdmin && (
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/admin")}>
          <Text>League/Division Admin</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Dev: jump to a team by ID</Text>
      <TextInput
        style={styles.input}
        placeholder="team UUID"
        value={teamId}
        onChangeText={setTeamId}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={[styles.button, !teamId && styles.buttonDisabled]}
        disabled={!teamId}
        onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}
      >
        <Text style={styles.buttonText}>Import a Game</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => signOut()}>
        <Text>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  hint: { color: "#666" },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
});

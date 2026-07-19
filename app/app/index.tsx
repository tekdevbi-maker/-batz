import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

// Temporary dev-only entry point: there's no team switcher or coach auth
// yet (spec Sections 5/6, Sprint 3+), so this stands in for "pick your
// team" until that's built. Paste a team's UUID to jump to its Import a
// Game screen.
export default function DevHome() {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>@Batz (dev)</Text>
      <Text style={styles.hint}>
        No team switcher yet -- paste a team ID to open Import a Game for it.
      </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  hint: { color: "#666" },
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
});

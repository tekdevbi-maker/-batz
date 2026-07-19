import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { listGamesForTeam, type GameSummary } from "../../../../lib/statsRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function GameLogScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !session) return;
    listGamesForTeam(supabase, teamId).then(setGames).catch((err) => setError(errorMessage(err)));
  }, [teamId, session]);

  if (!session || !teamId) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Game Log</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {games.length === 0 && !error && <Text style={styles.hint}>No games imported yet.</Text>}
      {games.map((game) => (
        <Pressable
          key={game.id}
          style={styles.gameRow}
          onPress={() => router.push(`/team/${teamId}/games/${game.id}`)}
        >
          <Text style={styles.gameRowText}>
            Game #{game.gameNumber}
            {game.opponent ? ` vs ${game.opponent}` : ""} -- {game.gameDate}
            {game.timeOfDay ? ` (${game.timeOfDay})` : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  hint: { color: "#555", fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
  gameRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  gameRowText: { fontSize: 14 },
});

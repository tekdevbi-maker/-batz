import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { listGamesForTeam, type GameSummary } from "../../../../lib/statsRepository";
import { formatDateDisplay } from "../../../../lib/dateFormat";
import { colors } from "../../../../lib/theme";
import TeamTabBar from "../../../../components/TeamTabBar";

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
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
              {game.opponent ? ` vs ${game.opponent}` : ""} ({formatDateDisplay(game.gameDate)})
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="games" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 4 },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  gameRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameRowText: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textPrimary },
});

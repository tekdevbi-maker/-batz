import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { getGameBoxScore, type BoxScoreLine, type GameSummary } from "../../../../lib/statsRepository";
import { colors } from "../../../../lib/theme";
import StatColumns from "../../../../components/StatColumns";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function BoxScoreScreen() {
  const { session } = useRequireAuth();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [lines, setLines] = useState<BoxScoreLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !session) return;
    getGameBoxScore(supabase, gameId)
      .then((result) => {
        setGame(result.game);
        setLines(result.lines);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [gameId, session]);

  if (!session || !gameId) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {game && (
        <Text style={styles.title}>
          Game #{game.gameNumber}
          {game.opponent ? ` vs ${game.opponent}` : ""} -- {game.gameDate}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {lines.map((line) => (
        <View key={line.rosterEntryId} style={styles.lineRow}>
          <Text style={styles.playerTag}>
            #{line.jerseyNumber ?? "?"} {line.displayName}
          </Text>
          <StatColumns counts={line.counts} stats={line.stats} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  lineRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  playerTag: { fontWeight: "600", fontSize: 15, color: colors.textPrimary },
});

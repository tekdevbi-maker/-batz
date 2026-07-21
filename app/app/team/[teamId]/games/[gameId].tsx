import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { getGameBoxScore, type BoxScoreLine, type GameSummary } from "../../../../lib/statsRepository";
import { colors } from "../../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
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
          <Text style={styles.statLine}>
            {line.counts.ab} AB, {line.counts.h} H, {line.counts.singles} 1B, {line.counts.doubles} 2B,{" "}
            {line.counts.triples} 3B, {line.counts.hr} HR, {line.counts.rbi} RBI, {line.counts.bb} BB,{" "}
            {line.counts.hbp} HBP, {line.counts.sf} SF
          </Text>
          <Text style={styles.statLine}>
            AVG {fmt(line.stats.avg)} -- OBP {fmt(line.stats.obp)} -- SLG {fmt(line.stats.slg)} -- OPS{" "}
            {fmt(line.stats.ops)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 13 },
  lineRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  playerTag: { fontWeight: "600", fontSize: 14, color: colors.textPrimary },
  statLine: { fontSize: 12, color: colors.textSecondary },
});

import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { getGameBoxScore, type BoxScoreLine, type GameSummary } from "../../../../lib/statsRepository";
import { formatDateDisplay } from "../../../../lib/dateFormat";
import { colors } from "../../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

type SortKey = "uniformNumber" | "name" | "ab" | "h" | "doubles" | "triples" | "hr" | "rbi";

const COLUMNS: { key: SortKey; label: string; flex: number; value: (l: BoxScoreLine) => number | string }[] = [
  { key: "uniformNumber", label: "#", flex: 0.6, value: (l) => l.jerseyNumber ?? -1 },
  { key: "name", label: "Name", flex: 2, value: (l) => (l.playerId ? l.displayName : "") },
  { key: "ab", label: "AB", flex: 1, value: (l) => l.counts.ab },
  { key: "h", label: "Hits", flex: 1, value: (l) => l.counts.h },
  { key: "doubles", label: "2B", flex: 1, value: (l) => l.counts.doubles },
  { key: "triples", label: "3B", flex: 1, value: (l) => l.counts.triples },
  { key: "hr", label: "HR", flex: 1, value: (l) => l.counts.hr },
  { key: "rbi", label: "RBI", flex: 1, value: (l) => l.counts.rbi },
];

export default function BoxScoreScreen() {
  const { session } = useRequireAuth();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [lines, setLines] = useState<BoxScoreLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("uniformNumber");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (!gameId || !session) return;
    getGameBoxScore(supabase, gameId)
      .then((result) => {
        setGame(result.game);
        setLines(result.lines);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [gameId, session]);

  const column = COLUMNS.find((c) => c.key === sortKey)!;
  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...lines].sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
      return (av - bv) * dir;
    });
  }, [lines, column, sortAsc]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  if (!session || !gameId) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {game && (
        <Text style={styles.title}>
          Game #{game.gameNumber}
          {game.opponent ? ` vs ${game.opponent}` : ""} ({formatDateDisplay(game.gameDate)})
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.table}>
        <View style={styles.headerRow}>
          {COLUMNS.map((c) => (
            <Pressable key={c.key} style={[styles.headerCell, { flex: c.flex }]} onPress={() => handleSort(c.key)}>
              <Text style={[styles.headerText, sortKey === c.key && styles.headerTextActive]}>
                {c.label}
                {sortKey === c.key ? (sortAsc ? " ▲" : " ▼") : ""}
              </Text>
            </Pressable>
          ))}
        </View>
        {sorted.map((line) => (
          <View key={line.rosterEntryId} style={styles.row}>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[0].flex }]}>{line.jerseyNumber ?? "?"}</Text>
            <Text style={[styles.cell, styles.nameCell, { flex: COLUMNS[1].flex }]}>
              {line.playerId ? line.displayName : ""}
            </Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[2].flex }]}>{line.counts.ab}</Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[3].flex }]}>{line.counts.h}</Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[4].flex }]}>{line.counts.doubles}</Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[5].flex }]}>{line.counts.triples}</Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[6].flex }]}>{line.counts.hr}</Text>
            <Text style={[styles.cell, styles.numCell, { flex: COLUMNS[7].flex }]}>{line.counts.rbi}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 8,
  },
  headerCell: { alignItems: "center", paddingHorizontal: 2 },
  headerText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  headerTextActive: { color: colors.accent },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cell: { textAlign: "center", fontSize: 13, color: colors.textPrimary },
  numCell: { fontVariant: ["tabular-nums"] },
  nameCell: { textAlign: "left", paddingLeft: 4 },
});

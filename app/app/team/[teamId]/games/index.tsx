import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRequireAuth } from "../../../../lib/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { listGamesForTeam, type GameSummary } from "../../../../lib/statsRepository";
import { isCoachOnTeam } from "../../../../lib/teamsRepository";
import { deleteGame, exportGameCsv } from "../../../../lib/gamesRepository";
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
  const [isCoach, setIsCoach] = useState(false);
  const [exportingGameId, setExportingGameId] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);

  function refreshGames() {
    if (!teamId) return;
    listGamesForTeam(supabase, teamId).then(setGames).catch((err) => setError(errorMessage(err)));
  }

  useEffect(() => {
    if (!teamId || !session) return;
    refreshGames();
    isCoachOnTeam(supabase, teamId, session.user.id).then(setIsCoach).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, session]);

  if (!session || !teamId) return null;

  // Regenerates the CSV from what's actually stored for this game -- see
  // exportGameCsv -- and shares it the same way Live Scoring's save flow
  // does (Android SAF folder picker / iOS share sheet).
  async function handleExportGame(game: GameSummary) {
    setExportingGameId(game.id);
    setError(null);
    try {
      const { fileName, csvText } = await exportGameCsv(supabase, game.id);
      const mimeType = "text/csv";

      if (Platform.OS === "android") {
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const fileUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName.replace(/\.csv$/, ""),
          mimeType
        );
        await LegacyFileSystem.writeAsStringAsync(fileUri, csvText, { encoding: LegacyFileSystem.EncodingType.UTF8 });
      } else {
        const path = `${LegacyFileSystem.cacheDirectory}${fileName}`;
        await LegacyFileSystem.writeAsStringAsync(path, csvText, { encoding: LegacyFileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType, dialogTitle: "Export game stats" });
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExportingGameId(null);
    }
  }

  function confirmDeleteGame(game: GameSummary) {
    Alert.alert(
      "Delete this game?",
      `Game #${game.gameNumber}${game.opponent ? ` vs ${game.opponent}` : ""} on ${game.gameDate}. This can't be undone -- re-import from GameChanger if needed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingGameId(game.id);
            try {
              await deleteGame(supabase, game.id);
              refreshGames();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setDeletingGameId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        {isCoach && (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.actionTile}
              onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}
            >
              <Text style={styles.actionTileText}>Import Game</Text>
            </Pressable>
            <Pressable
              style={styles.actionTile}
              onPress={() => router.push({ pathname: "/live-score-setup", params: { teamId } })}
            >
              <Text style={styles.actionTileText}>Live Scoring</Text>
            </Pressable>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {games.length === 0 && !error && <Text style={styles.hint}>No games imported yet.</Text>}
        {games.map((game) => (
          <View key={game.id} style={styles.gameRow}>
            <Pressable style={styles.gameRowMain} onPress={() => router.push(`/team/${teamId}/games/${game.id}`)}>
              <Text style={styles.gameRowText}>
                Game #{game.gameNumber}
                {game.opponent ? ` vs ${game.opponent}` : ""} ({formatDateDisplay(game.gameDate)})
              </Text>
            </Pressable>
            {isCoach && (
              <View style={styles.gameRowActions}>
                <Pressable
                  style={styles.exportButton}
                  disabled={exportingGameId === game.id}
                  onPress={() => handleExportGame(game)}
                >
                  {exportingGameId === game.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={styles.exportButtonText}>Export</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  disabled={deletingGameId === game.id}
                  onPress={() => confirmDeleteGame(game)}
                >
                  {deletingGameId === game.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
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
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionTile: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  actionTileText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameRowMain: { flex: 1, paddingVertical: 4 },
  gameRowText: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textPrimary },
  gameRowActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  exportButtonText: { color: colors.accent, fontSize: 14, fontFamily: "Montserrat_600SemiBold" },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontFamily: "Montserrat_600SemiBold" },
});

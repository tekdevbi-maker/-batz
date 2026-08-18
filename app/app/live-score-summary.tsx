import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRequireAuth } from "../lib/AuthContext";
import { getLiveScoreState, resetLiveScoreState, setPendingImportHandoff } from "../lib/liveScoreState";
import { buildLiveScoreLines, buildLiveScoreCsv } from "../lib/liveScoreExport";
import { buildGameCsvFileName } from "../lib/gameChangerImport";
import { aggregateBattingCounts } from "../lib/stats";
import { todayIso } from "../lib/dateFormat";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Read-only recap shown right after "End Game" -- confirms the totals look
// right before anything is saved anywhere. Saving here both writes the CSV
// to the coach's phone AND hands the already-parsed lines straight to
// Import a Game's last step (skip re-uploading the file just written).
export default function LiveScoreSummaryScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const state = getLiveScoreState();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!session || !teamId) return null;

  if (state.lineup.length === 0) {
    router.replace({ pathname: "/live-score-setup", params: { teamId } });
    return null;
  }

  const lines = buildLiveScoreLines(state.lineup, state.atBats);
  const totals = aggregateBattingCounts(lines);

  function handleDiscard() {
    resetLiveScoreState();
    router.replace(`/team/${teamId}`);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const fileName = buildGameCsvFileName(state.gameNumber, state.teamName, state.opponent, new Date());
      const csvText = buildLiveScoreCsv(state.lineup, state.atBats);
      const mimeType = "text/csv";

      if (Platform.OS === "android") {
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          setSaving(false);
          return;
        }
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
          await Sharing.shareAsync(path, { mimeType, dialogTitle: "Save the game's stats" });
        }
      }

      setPendingImportHandoff({
        gameDate: todayIso(),
        gameNumber: state.gameNumber,
        opponent: state.opponent,
        lines,
        fileName,
      });
      resetLiveScoreState();
      // Deliberately skip setSaving(false) here -- this component is about
      // to unmount as we navigate away, and clearing it would force one
      // more render first. That render re-reads getLiveScoreState() (now
      // empty from the resetLiveScoreState() call above), which trips this
      // screen's own "no lineup -> back to setup" guard and fires a second,
      // competing navigation that can beat this one to the punch.
      router.replace({ pathname: "/import-game", params: { teamId, prefillFromLiveScore: "1" } });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Game Summary</Text>
      <Text style={styles.subtitle}>
        {state.teamName} — Game {state.gameNumber || "?"} vs {state.opponent || "?"}
      </Text>

      <ScrollView horizontal contentContainerStyle={styles.tableWrap}>
        <View>
          <View style={styles.headerRow}>
            <Text style={[styles.cell, styles.nameCell, styles.headerText]}>Player</Text>
            <Text style={[styles.cell, styles.headerText]}>AB</Text>
            <Text style={[styles.cell, styles.headerText]}>H</Text>
            <Text style={[styles.cell, styles.headerText]}>2B</Text>
            <Text style={[styles.cell, styles.headerText]}>3B</Text>
            <Text style={[styles.cell, styles.headerText]}>HR</Text>
            <Text style={[styles.cell, styles.headerText]}>RBI</Text>
            <Text style={[styles.cell, styles.headerText]}>BB</Text>
            <Text style={[styles.cell, styles.headerText]}>HBP</Text>
            <Text style={[styles.cell, styles.headerText]}>SF</Text>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
                #{line.jerseyNumber} {[line.firstName, line.lastName].filter(Boolean).join(" ")}
              </Text>
              <Text style={styles.cell}>{line.ab}</Text>
              <Text style={styles.cell}>{line.h}</Text>
              <Text style={styles.cell}>{line.doubles}</Text>
              <Text style={styles.cell}>{line.triples}</Text>
              <Text style={styles.cell}>{line.hr}</Text>
              <Text style={styles.cell}>{line.rbi}</Text>
              <Text style={styles.cell}>{line.bb}</Text>
              <Text style={styles.cell}>{line.hbp}</Text>
              <Text style={styles.cell}>{line.sf}</Text>
            </View>
          ))}
          <View style={[styles.row, styles.totalsRow]}>
            <Text style={[styles.cell, styles.nameCell, styles.totalsText]}>Totals</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.ab}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.h}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.doubles}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.triples}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.hr}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.rbi}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.bb}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.hbp}</Text>
            <Text style={[styles.cell, styles.totalsText]}>{totals.sf}</Text>
          </View>
        </View>
      </ScrollView>

      <Text style={styles.question}>Would you like to import this game?</Text>
      {saveError && <Text style={styles.error}>{saveError}</Text>}

      <View style={styles.buttonRow}>
        <Pressable style={styles.noButton} disabled={saving} onPress={handleDiscard}>
          <Text style={styles.noButtonText}>No</Text>
        </Pressable>
        <Pressable style={[styles.yesButton, saving && styles.buttonDisabled]} disabled={saving} onPress={handleSave}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={styles.yesButtonText}>Import Game</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8, paddingBottom: 48 },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  subtitle: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, marginBottom: 12 },
  tableWrap: { paddingBottom: 8 },
  headerRow: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: colors.border, paddingBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  totalsRow: { borderTopWidth: 2, borderTopColor: colors.border, borderBottomWidth: 0 },
  cell: { width: 48, textAlign: "center", color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 14 },
  nameCell: { width: 140, textAlign: "left", fontFamily: "Montserrat_600SemiBold" },
  headerText: { fontFamily: "Montserrat_700Bold", color: colors.textSecondary, fontSize: 13 },
  totalsText: { fontFamily: "Montserrat_700Bold" },
  question: { fontSize: 17, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginTop: 24, textAlign: "center" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular", textAlign: "center", marginTop: 8 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  noButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  noButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  yesButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  yesButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
});

import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Platform, Animated } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRequireAuth } from "../lib/AuthContext";
import {
  getLiveScoreState,
  resetLiveScoreState,
  type AtBatEntry,
  type AtBatOutcome,
} from "../lib/liveScoreState";
import { buildLiveScoreCsv } from "../lib/liveScoreExport";
import PlayerCard from "../components/PlayerCard";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const OUTCOMES: { key: AtBatOutcome; label: string }[] = [
  { key: "1B", label: "1B" },
  { key: "2B", label: "2B" },
  { key: "3B", label: "3B" },
  { key: "HR", label: "HR" },
  { key: "BB", label: "BB" },
  { key: "HBP", label: "HBP" },
  { key: "SF", label: "SF" },
  { key: "OUT", label: "Out" },
];

const CARD_SCALE_ACTIVE = 1.35;

function playerLabel(uniformNumber: number, firstName: string, lastName: string): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name ? `#${uniformNumber} ${name}` : `#${uniformNumber}`;
}

// The at-bat entry screen -- tap the current batter's outcome, optionally
// add RBI, confirm to log it and advance to the next batter in order.
// Correction is only available up until "End Game" (Undo pops the most
// recent entry); after that the coach edits the exported file directly,
// per the design discussion -- no in-app edit-after-export flow.
export default function LiveScoreScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const initial = getLiveScoreState();
  const [lineup] = useState(initial.lineup);
  const [teamName] = useState(initial.teamName);
  const [atBats, setAtBats] = useState<AtBatEntry[]>(initial.atBats);
  const [nextBatterIndex, setNextBatterIndex] = useState(initial.nextBatterIndex);
  const [pendingOutcome, setPendingOutcome] = useState<AtBatOutcome | null>(null);
  const [pendingRbi, setPendingRbi] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // One scale value per lineup slot -- the current batter's card animates
  // up to CARD_SCALE_ACTIVE while every other card eases back down to 1,
  // so the "zoom" reads as the previous batter shrinking as the next one
  // grows, not an abrupt swap.
  const cardScales = useRef(initial.lineup.map(() => new Animated.Value(1))).current;
  const currentIndex = lineup.length > 0 ? nextBatterIndex % lineup.length : 0;

  useEffect(() => {
    cardScales.forEach((value, index) => {
      Animated.spring(value, {
        toValue: index === currentIndex ? CARD_SCALE_ACTIVE : 1,
        friction: 7,
        useNativeDriver: true,
      }).start();
    });
    // cardScales is a stable ref array, safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Redirect back if this screen is ever reached without a lineup set up
  // (e.g. a stale deep link or a screen remount after backgrounding wiped
  // the module-scoped state).
  useEffect(() => {
    if (lineup.length === 0 && teamId) {
      router.replace({ pathname: "/live-score-setup", params: { teamId } });
    }
  }, [lineup.length, teamId, router]);

  if (!session || !teamId || lineup.length === 0) return null;

  const currentBatter = lineup[currentIndex];

  function handleConfirm() {
    if (!pendingOutcome) return;
    const entry: AtBatEntry = { rosterEntryId: currentBatter.rosterEntryId, outcome: pendingOutcome, rbi: pendingRbi };
    setAtBats((prev) => [...prev, entry]);
    setNextBatterIndex((prev) => (prev + 1) % lineup.length);
    setPendingOutcome(null);
    setPendingRbi(0);
  }

  function handleUndo() {
    if (atBats.length === 0) return;
    setAtBats((prev) => prev.slice(0, -1));
    setNextBatterIndex((prev) => (prev - 1 + lineup.length) % lineup.length);
    setPendingOutcome(null);
    setPendingRbi(0);
  }

  async function handleEndGame() {
    setSaving(true);
    setSaveError(null);
    try {
      const csvText = buildLiveScoreCsv(lineup, atBats);
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const fileName = `batz_live_${datePart}_${(teamName || "team").replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;
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

      resetLiveScoreState();
      router.replace({ pathname: "/import-game", params: { teamId } });
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmEndGame() {
    Alert.alert(
      "End Game?",
      "This saves the game's stats to a file on your phone and locks further corrections. You can still edit the saved file directly afterward.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "End Game", style: "destructive", onPress: handleEndGame },
      ]
    );
  }

  const recentEntries = atBats.slice(-5).reverse();

  return (
    <View style={styles.screen}>
      <View style={styles.rosterHalf}>
        <Text style={styles.title}>{teamName} — Now Batting: #{currentBatter.uniformNumber}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rosterRow}
        >
          {lineup.map((player, index) => (
            <Animated.View
              key={player.rosterEntryId}
              style={[
                styles.playerCardWrapper,
                { transform: [{ scale: cardScales[index] }], zIndex: index === currentIndex ? 2 : 1 },
              ]}
            >
              <PlayerCard firstName={player.firstName || `#${player.uniformNumber}`} lastName={player.lastName} />
            </Animated.View>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.bottomHalf} contentContainerStyle={styles.container}>
      <View style={styles.outcomeGrid}>
        {OUTCOMES.map((outcome) => (
          <Pressable
            key={outcome.key}
            style={[styles.outcomeButton, pendingOutcome === outcome.key && styles.outcomeButtonSelected]}
            onPress={() => setPendingOutcome(outcome.key)}
          >
            <Text style={[styles.outcomeButtonText, pendingOutcome === outcome.key && styles.outcomeButtonTextSelected]}>
              {outcome.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {pendingOutcome && (
        <View style={styles.rbiRow}>
          <Text style={styles.rbiLabel}>RBI</Text>
          <Pressable style={styles.rbiButton} disabled={pendingRbi === 0} onPress={() => setPendingRbi((r) => Math.max(0, r - 1))}>
            <Text style={styles.rbiButtonText}>−</Text>
          </Pressable>
          <Text style={styles.rbiValue}>{pendingRbi}</Text>
          <Pressable style={styles.rbiButton} disabled={pendingRbi >= 4} onPress={() => setPendingRbi((r) => Math.min(4, r + 1))}>
            <Text style={styles.rbiButtonText}>+</Text>
          </Pressable>
          <Pressable style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={[styles.undoButton, atBats.length === 0 && styles.buttonDisabled]} disabled={atBats.length === 0} onPress={handleUndo}>
        <Text style={styles.undoButtonText}>Undo Last At-Bat</Text>
      </Pressable>

      {recentEntries.length > 0 && (
        <>
          <Text style={styles.label}>Recent</Text>
          {recentEntries.map((entry, i) => {
            const player = lineup.find((p) => p.rosterEntryId === entry.rosterEntryId);
            return (
              <Text key={atBats.length - i} style={styles.recentText}>
                {player ? playerLabel(player.uniformNumber, player.firstName, player.lastName) : "?"} — {entry.outcome}
                {entry.rbi > 0 ? ` (${entry.rbi} RBI)` : ""}
              </Text>
            );
          })}
        </>
      )}

      {saveError && <Text style={styles.error}>{saveError}</Text>}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={confirmEndGame}>
        <Text style={styles.buttonText}>{saving ? "Saving…" : "End Game"}</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  rosterHalf: {
    flex: 1,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 12,
  },
  rosterRow: { alignItems: "center", paddingHorizontal: 20, gap: 16, flexGrow: 1 },
  playerCardWrapper: { width: 100 },
  bottomHalf: { flex: 1 },
  container: { padding: 20, gap: 8, paddingBottom: 48 },
  title: {
    fontSize: 15,
    fontFamily: "Montserrat_700Bold",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  label: { fontSize: 15, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginTop: 16 },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12, justifyContent: "center" },
  outcomeButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  outcomeButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  outcomeButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_700Bold", fontSize: 16, textAlign: "center" },
  outcomeButtonTextSelected: { color: "white" },
  rbiRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  rbiLabel: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold" },
  rbiButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rbiButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_700Bold", fontSize: 18 },
  rbiValue: { color: colors.textPrimary, fontFamily: "Montserrat_700Bold", fontSize: 18, minWidth: 20, textAlign: "center" },
  confirmButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, marginLeft: "auto" },
  confirmButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
  undoButton: {
    alignSelf: "flex-start",
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.danger,
    borderRadius: 8,
  },
  undoButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
  recentText: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 14 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular", marginTop: 12 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 24 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

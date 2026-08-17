import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Platform, Animated, type LayoutChangeEvent } from "react-native";
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
import PlayerCard, { CARD_ASPECT_RATIO } from "../components/PlayerCard";
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

const GRID_GAP = 10;
const GRID_PADDING = 12;

function playerLabel(uniformNumber: number, firstName: string, lastName: string): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name ? `#${uniformNumber} ${name}` : `#${uniformNumber}`;
}

// Picks the fewest columns (i.e. the biggest cards) that still let every
// player in the lineup fit within the roster half without scrolling --
// tries 1 column first, then 2, etc., stopping at the first column count
// whose total grid height fits the measured container.
function computeGridLayout(
  containerWidth: number,
  containerHeight: number,
  count: number
): { columns: number; cardWidth: number; cardHeight: number } {
  const usableWidth = Math.max(containerWidth - GRID_PADDING * 2, 1);
  for (let columns = 1; columns <= count; columns++) {
    const cardWidth = (usableWidth - GRID_GAP * (columns - 1)) / columns;
    const cardHeight = cardWidth / CARD_ASPECT_RATIO;
    const rows = Math.ceil(count / columns);
    const totalHeight = rows * cardHeight + GRID_GAP * (rows - 1);
    if (totalHeight <= containerHeight || columns === count) {
      return { columns, cardWidth, cardHeight };
    }
  }
  const cardWidth = usableWidth / count;
  return { columns: count, cardWidth, cardHeight: cardWidth / CARD_ASPECT_RATIO };
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
  // up to activeScale while every other card eases back down to 1, so the
  // "zoom" reads as the previous batter shrinking as the next one grows,
  // not an abrupt swap. Scale transforms in RN pivot around the view's own
  // center by default, so this zooms in/out from each card's center.
  const cardScales = useRef(initial.lineup.map(() => new Animated.Value(1))).current;
  const currentIndex = lineup.length > 0 ? nextBatterIndex % lineup.length : 0;

  // Measured once the roster half lays out -- drives both the grid's
  // column count (as many as fit, biggest cards that still show the whole
  // team with no scrolling) and how far the active card needs to scale up
  // to read as "more than half the roster half," which shrinks as the
  // team gets bigger (smaller base cards need a bigger multiplier).
  const [rosterSize, setRosterSize] = useState({ width: 0, height: 0 });
  function handleRosterLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setRosterSize({ width, height });
  }
  const grid = computeGridLayout(rosterSize.width, rosterSize.height, Math.max(lineup.length, 1));
  const activeScale =
    grid.cardHeight > 0
      ? Math.min(
          Math.max((rosterSize.height * 0.6) / grid.cardHeight, 1.15),
          (rosterSize.width * 0.92) / grid.cardWidth
        )
      : 1.15;

  useEffect(() => {
    cardScales.forEach((value, index) => {
      Animated.spring(value, {
        toValue: index === currentIndex ? activeScale : 1,
        friction: 7,
        useNativeDriver: true,
      }).start();
    });
    // cardScales is a stable ref array; activeScale/grid are derived from
    // rosterSize, which is already a dependency via currentIndex re-runs
    // whenever layout or batter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, activeScale]);

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

  const lastEntry = atBats.length > 0 ? atBats[atBats.length - 1] : null;
  const lastEntryPlayer = lastEntry ? lineup.find((p) => p.rosterEntryId === lastEntry.rosterEntryId) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.rosterHalf} onLayout={handleRosterLayout}>
        {rosterSize.width > 0 && (
          <View style={styles.rosterGrid}>
            {lineup.map((player, index) => (
              <Animated.View
                key={player.rosterEntryId}
                style={[
                  { width: grid.cardWidth, transform: [{ scale: cardScales[index] }] },
                  { zIndex: index === currentIndex ? 2 : 1 },
                ]}
              >
                <PlayerCard firstName={player.firstName || `#${player.uniformNumber}`} lastName={player.lastName} />
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.bottomHalf}>
        <Text style={styles.batterName} numberOfLines={1} adjustsFontSizeToFit>
          Now Batting: {playerLabel(currentBatter.uniformNumber, currentBatter.firstName, currentBatter.lastName)}
        </Text>

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

        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.undoButton, atBats.length === 0 && styles.buttonDisabled]}
            disabled={atBats.length === 0}
            onPress={handleUndo}
          >
            <Text style={styles.undoButtonText}>Undo Last At-Bat</Text>
          </Pressable>
          {lastEntry && (
            <Text style={styles.recentText} numberOfLines={1}>
              Last: {lastEntryPlayer ? playerLabel(lastEntryPlayer.uniformNumber, lastEntryPlayer.firstName, lastEntryPlayer.lastName) : "?"} — {lastEntry.outcome}
              {lastEntry.rbi > 0 ? ` (${lastEntry.rbi} RBI)` : ""}
            </Text>
          )}
        </View>

        {saveError && <Text style={styles.error} numberOfLines={2}>{saveError}</Text>}

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={confirmEndGame}>
          <Text style={styles.buttonText}>{saving ? "Saving…" : "End Game"}</Text>
        </Pressable>
      </View>
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
    alignItems: "center",
    justifyContent: "center",
  },
  rosterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  bottomHalf: { flex: 1, padding: 16, paddingBottom: 24, justifyContent: "space-between" },
  batterName: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  outcomeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  outcomeButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  outcomeButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_700Bold", fontSize: 16, textAlign: "center" },
  outcomeButtonTextSelected: { color: "white" },
  rbiRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.danger,
    borderRadius: 8,
  },
  undoButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 13 },
  recentText: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 13, flexShrink: 1 },
  error: { color: colors.error, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

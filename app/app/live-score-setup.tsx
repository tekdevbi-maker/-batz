import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listRosterEntriesForLiveScoring, type LiveScoringRosterEntry } from "../lib/gamesRepository";
import { getTeamJoinContext } from "../lib/claimRepository";
import { resetLiveScoreState, updateLiveScoreState } from "../lib/liveScoreState";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function rosterLabel(player: LiveScoringRosterEntry): string {
  const name = [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  return name ? `#${player.uniformNumber} ${name}` : `#${player.uniformNumber}`;
}

// Sets the batting order before handing off to live-score.tsx -- tap a
// roster player to add them to the order, tap again in the order list to
// remove, up/down arrows to reorder. Kept deliberately simple (no drag
// library) since a coach is doing this one-handed at the field.
export default function LiveScoreSetupScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [roster, setRoster] = useState<LiveScoringRosterEntry[]>([]);
  const [order, setOrder] = useState<LiveScoringRosterEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    resetLiveScoreState();
    Promise.all([
      listRosterEntriesForLiveScoring(supabase, teamId),
      getTeamJoinContext(supabase, teamId).then((c) => c.teamName),
    ])
      .then(([rosterRows, name]) => {
        setRoster(rosterRows);
        setTeamName(name);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, [teamId]);

  const availableRoster = roster.filter((r) => !order.some((o) => o.rosterEntryId === r.rosterEntryId));

  function addToOrder(player: LiveScoringRosterEntry) {
    setOrder((prev) => [...prev, player]);
  }

  function removeFromOrder(rosterEntryId: string) {
    setOrder((prev) => prev.filter((p) => p.rosterEntryId !== rosterEntryId));
  }

  function moveInOrder(index: number, direction: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function handleStartGame() {
    if (!teamId || order.length === 0) return;
    updateLiveScoreState({
      teamId,
      teamName,
      lineup: order.map((p) => ({
        rosterEntryId: p.rosterEntryId,
        uniformNumber: p.uniformNumber,
        firstName: p.firstName,
        lastName: p.lastName,
      })),
      atBats: [],
      nextBatterIndex: 0,
    });
    router.push({ pathname: "/live-score", params: { teamId } });
  }

  if (!session || !teamId) return null;

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set Batting Order</Text>
      <Text style={styles.hint}>Tap players below to add them to the batting order, in the order they'll hit.</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {order.length > 0 && (
        <>
          <Text style={styles.label}>Batting Order</Text>
          {order.map((player, index) => (
            <View key={player.rosterEntryId} style={styles.orderRow}>
              <Text style={styles.orderIndex}>{index + 1}.</Text>
              <Text style={styles.orderName}>{rosterLabel(player)}</Text>
              <View style={styles.orderButtons}>
                <Pressable style={styles.smallButton} disabled={index === 0} onPress={() => moveInOrder(index, -1)}>
                  <Text style={[styles.smallButtonText, index === 0 && styles.smallButtonTextDisabled]}>↑</Text>
                </Pressable>
                <Pressable
                  style={styles.smallButton}
                  disabled={index === order.length - 1}
                  onPress={() => moveInOrder(index, 1)}
                >
                  <Text style={[styles.smallButtonText, index === order.length - 1 && styles.smallButtonTextDisabled]}>↓</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => removeFromOrder(player.rosterEntryId)}>
                  <Text style={[styles.smallButtonText, styles.removeText]}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.label}>Roster</Text>
      {availableRoster.length === 0 && order.length === 0 && (
        <Text style={styles.hint}>No roster players found for this team yet.</Text>
      )}
      {availableRoster.map((player) => (
        <Pressable key={player.rosterEntryId} style={styles.rosterRow} onPress={() => addToOrder(player)}>
          <Text style={styles.rosterName}>{rosterLabel(player)}</Text>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      ))}

      <Pressable
        style={[styles.button, order.length === 0 && styles.buttonDisabled]}
        disabled={order.length === 0}
        onPress={handleStartGame}
      >
        <Text style={styles.buttonText}>Start Game</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  container: { padding: 20, gap: 8, paddingBottom: 48 },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  label: { fontSize: 15, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginTop: 16 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderIndex: { color: colors.textSecondary, fontFamily: "Montserrat_600SemiBold", width: 20 },
  orderName: { flex: 1, color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 15 },
  orderButtons: { flexDirection: "row", gap: 6 },
  smallButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  smallButtonTextDisabled: { color: colors.textSecondary },
  removeText: { color: colors.danger },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rosterName: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 15 },
  addText: { color: colors.accent, fontFamily: "Montserrat_600SemiBold" },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 24 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

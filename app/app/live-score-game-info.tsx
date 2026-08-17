import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { getLastGameForTeam, getDivisionOpponents } from "../lib/gamesRepository";
import { getLiveScoreState, updateLiveScoreState } from "../lib/liveScoreState";
import { MLB_TEAMS } from "../lib/mlbTeams";
import { colors } from "../lib/theme";

// Between setting the batting order and actually starting to score --
// collects the game number and opponent, same info Import a Game's step 1
// asks for, so the exported file (buildLiveScoreCsv's filename) can carry
// them without the coach re-entering them again on the Import screen
// afterward.
export default function LiveScoreGameInfoScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const initial = getLiveScoreState();
  const [gameNumber, setGameNumber] = useState(initial.gameNumber);
  const [opponent, setOpponent] = useState(initial.opponent);
  const [showOpponentSuggestions, setShowOpponentSuggestions] = useState(false);
  const [divisionOpponents, setDivisionOpponents] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!teamId) return;
    getLastGameForTeam(supabase, teamId)
      .then((game) => {
        if (!gameNumber) setGameNumber(String((game?.gameNumber ?? 0) + 1));
      })
      .catch(() => {});
    getDivisionOpponents(supabase, teamId).then(setDivisionOpponents).catch(() => {});
    // Only ever run once on mount -- gameNumber is deliberately left out so
    // typing doesn't retrigger this default-filling effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Redirect back if this screen is ever reached without a lineup already
  // set up (e.g. a stale deep link).
  useEffect(() => {
    if (initial.lineup.length === 0 && teamId) {
      router.replace({ pathname: "/live-score-setup", params: { teamId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  if (!session || !teamId) return null;

  const opponentSuggestions = (() => {
    const query = opponent.trim().toLowerCase();
    if (!query) return [];
    const names = [
      ...divisionOpponents.map((team) => team.name),
      ...MLB_TEAMS.filter((team) => !divisionOpponents.some((d) => d.name === team)),
    ];
    return names.filter((name) => name.toLowerCase().includes(query) && name !== opponent).slice(0, 8);
  })();

  const canStart = gameNumber.trim().length > 0 && opponent.trim().length > 0;

  function handleStartGame() {
    if (!canStart) return;
    updateLiveScoreState({ gameNumber: gameNumber.trim(), opponent: opponent.trim() });
    router.push({ pathname: "/live-score", params: { teamId } });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Game Info</Text>

      <Text style={styles.label}>Game Number</Text>
      <TextInput
        style={styles.input}
        value={gameNumber}
        onChangeText={setGameNumber}
        keyboardType="number-pad"
        placeholder="1"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Opponent</Text>
      <TextInput
        style={styles.input}
        value={opponent}
        onChangeText={(text) => {
          setOpponent(text);
          setShowOpponentSuggestions(true);
        }}
        onFocus={() => setShowOpponentSuggestions(true)}
        onBlur={() => setTimeout(() => setShowOpponentSuggestions(false), 150)}
        placeholder="Enter opponent name"
        placeholderTextColor={colors.textSecondary}
      />
      {showOpponentSuggestions && opponentSuggestions.length > 0 && (
        <View style={styles.suggestionList}>
          {opponentSuggestions.map((name) => (
            <Pressable
              key={name}
              style={styles.suggestionRow}
              onPress={() => {
                setOpponent(name);
                setShowOpponentSuggestions(false);
              }}
            >
              <Text style={styles.suggestionText}>{name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.navRow}>
        <Pressable style={[styles.secondaryButton, styles.navButton]} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.navButton, !canStart && styles.buttonDisabled]}
          disabled={!canStart}
          onPress={handleStartGame}
        >
          <Text style={styles.buttonText}>Start Game</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 8 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  suggestionList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginTop: -4,
  },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular" },
  navRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  navButton: { flex: 1, marginTop: 0 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

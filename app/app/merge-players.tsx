import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyPlayers, mergeMyPlayers, type MyPlayer } from "../lib/playerRepository";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// If a coach misspelled a player's name on two different rosters, the
// parent can end up owning two separate profiles for the same kid -- the
// automatic dedupe only merges an exact name match, so a typo slips past
// it. This screen lets the parent pick the two duplicates themselves and
// pick which one survives.
export default function MergePlayersScreen() {
  const { session } = useRequireAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<MyPlayer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [keepPlayerId, setKeepPlayerId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session) return;
    listMyPlayers(supabase, session.user.id)
      .then((r) => setPlayers(r.myPlayers))
      .catch((err) => setLoadError(errorMessage(err)));
  }, [session]);

  function toggleSelect(playerId: string) {
    setMergeError(null);
    setSelected((prev) => {
      if (prev.includes(playerId)) {
        setKeepPlayerId((k) => (k === playerId ? null : k));
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, playerId];
    });
  }

  async function handleMerge() {
    if (selected.length !== 2 || !keepPlayerId) return;
    const mergePlayerId = selected.find((id) => id !== keepPlayerId);
    if (!mergePlayerId) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeMyPlayers(supabase, keepPlayerId, mergePlayerId);
      setDone(true);
    } catch (err) {
      setMergeError(errorMessage(err));
    } finally {
      setMerging(false);
    }
  }

  if (!session) return null;

  if (done) {
    return (
      <>
        <SafeTopSpacer />
        <View style={styles.container}>
          <Text style={styles.title}>Players merged</Text>
          <Text style={styles.hint}>The duplicate profile's history now lives under the one you kept.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/")}>
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Merge Duplicate Players</Text>
        <Text style={styles.hint}>
          Do you have duplicate player profiles? Select both profiles below, choose which one to keep, and
          "Merge Players".
        </Text>

        {loadError && <Text style={styles.error}>{loadError}</Text>}
        {!players && !loadError && <ActivityIndicator style={styles.spacer} />}
        {players && players.length < 2 && (
          <Text style={styles.hint}>You need at least two players on your account to merge anything.</Text>
        )}

        {players?.map((p) => {
          const isSelected = selected.includes(p.playerId);
          return (
            <Pressable
              key={p.playerId}
              style={[styles.playerRow, isSelected && styles.playerRowSelected]}
              onPress={() => toggleSelect(p.playerId)}
            >
              <Text style={styles.playerName}>{p.displayName}</Text>
              {isSelected && <Text style={styles.selectedTag}>Selected</Text>}
            </Pressable>
          );
        })}

        {selected.length === 2 && (
          <>
            <Text style={styles.label}>Which one do you want to keep?</Text>
            {selected.map((id) => {
              const p = players?.find((pl) => pl.playerId === id);
              if (!p) return null;
              const isKeep = keepPlayerId === id;
              return (
                <Pressable
                  key={id}
                  style={[styles.playerRow, isKeep && styles.playerRowKeep]}
                  onPress={() => setKeepPlayerId(id)}
                >
                  <Text style={styles.playerName}>{p.displayName}</Text>
                  <Text style={styles.selectedTag}>{isKeep ? "Keep this one" : "Merge away"}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {mergeError && <Text style={styles.error}>{mergeError}</Text>}
        <Pressable
          style={[styles.button, (selected.length !== 2 || !keepPlayerId || merging) && styles.buttonDisabled]}
          disabled={selected.length !== 2 || !keepPlayerId || merging}
          onPress={handleMerge}
        >
          {merging ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Merge Players</Text>}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 12, lineHeight: 20 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 16, marginBottom: 4, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  spacer: { marginTop: 24 },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  playerRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  playerRowKeep: { borderColor: colors.success },
  playerName: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  selectedTag: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 20 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { searchPlayers, type PlayerSearchResult } from "../lib/playerRepository";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function SearchScreen() {
  const { session } = useRequireAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchPlayers(supabase, query));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  if (!session) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Find a Player</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by PlayerTag"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={handleSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={[styles.button, !query.trim() && styles.buttonDisabled]} disabled={!query.trim()} onPress={handleSearch}>
        {searching ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Search</Text>}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
      {results && results.length === 0 && <Text style={styles.hint}>No players found.</Text>}
      {results?.map((r) => (
        <Pressable key={r.playerId} style={styles.resultRow} onPress={() => router.push(`/player/${r.playerId}`)}>
          <Text style={styles.resultText}>{r.displayName}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
  resultRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultText: { color: colors.textPrimary },
});

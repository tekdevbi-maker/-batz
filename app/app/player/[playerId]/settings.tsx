import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getPlayerProfile, updatePlayerSettings } from "../../../lib/playerRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function PlayerSettingsScreen() {
  const { session } = useRequireAuth();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [playerTag, setPlayerTag] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [revealFullName, setRevealFullName] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!playerId || !session) return;
    getPlayerProfile(supabase, playerId, session.user.id)
      .then((p) => {
        if (p) {
          setIsOwner(p.isOwner);
          setPlayerTag(p.playerTag);
          setVisibility(p.visibilityScope);
          setRevealFullName(p.revealFullName);
        }
        setLoaded(true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoaded(true);
      });
  }, [playerId, session]);

  async function handleSave() {
    if (!playerId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updatePlayerSettings(supabase, playerId, {
        playerTag: playerTag.trim(),
        visibilityScope: visibility,
        revealFullName,
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!session || !playerId) return null;
  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!isOwner) {
    return (
      <View style={styles.container}>
        <Text>Only this player's parent can change their settings.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>PlayerTag</Text>
      <TextInput style={styles.input} value={playerTag} onChangeText={setPlayerTag} autoCapitalize="none" />
      <Text style={styles.hint}>The name shown everywhere in the app. Must be unique.</Text>

      <Text style={styles.label}>Visibility</Text>
      <View style={styles.chipRow}>
        {(["public", "private"] as const).map((v) => (
          <Pressable key={v} style={[styles.chip, visibility === v && styles.chipSelected]} onPress={() => setVisibility(v)}>
            <Text>{v === "public" ? "Public" : "Private"}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {visibility === "public"
          ? "Stats visible to any signed-in @Batz user."
          : "Stats visible only to coaches and parents in this player's league/division for the current season."}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Show real name instead of PlayerTag</Text>
        <Switch value={revealFullName} onValueChange={setRevealFullName} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.success}>Saved.</Text>}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={handleSave}>
        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
        <Text>Back to profile</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12, flexShrink: 1 },
  hint: { color: "#555", fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
  success: { color: "#15803d", fontSize: 14, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#dbeafe", borderColor: "#1d4ed8" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, alignItems: "center" },
});

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
import { getPlayerProfile, updatePlayerSettings, type BatsThrows } from "../../../lib/playerRepository";
import { colors } from "../../../lib/theme";

const BATS_THROWS_OPTIONS: BatsThrows[] = ["Right", "Left", "Switch"];

function parseOptionalInt(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

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
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [bats, setBats] = useState<BatsThrows | null>(null);
  const [throwsHand, setThrowsHand] = useState<BatsThrows | null>(null);

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
          setHeightFeet(p.heightFeet != null ? String(p.heightFeet) : "");
          setHeightInches(p.heightInches != null ? String(p.heightInches) : "");
          setWeightLbs(p.weightLbs != null ? String(p.weightLbs) : "");
          setBats(p.bats);
          setThrowsHand(p.throws);
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
        heightFeet: parseOptionalInt(heightFeet),
        heightInches: parseOptionalInt(heightInches),
        weightLbs: parseOptionalInt(weightLbs),
        bats,
        throws: throwsHand,
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
        <Text style={styles.plainText}>Only this player's parent can change their settings.</Text>
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
            <Text style={styles.chipText}>{v === "public" ? "Public" : "Private"}</Text>
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

      <Text style={styles.label}>Height</Text>
      <View style={styles.heightRow}>
        <TextInput
          style={[styles.input, styles.heightInput]}
          value={heightFeet}
          onChangeText={setHeightFeet}
          keyboardType="number-pad"
          placeholder="Ft"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.plainText}>ft</Text>
        <TextInput
          style={[styles.input, styles.heightInput]}
          value={heightInches}
          onChangeText={setHeightInches}
          keyboardType="number-pad"
          placeholder="In"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.plainText}>in</Text>
      </View>

      <Text style={styles.label}>Weight</Text>
      <View style={styles.heightRow}>
        <TextInput
          style={[styles.input, styles.heightInput]}
          value={weightLbs}
          onChangeText={setWeightLbs}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.plainText}>lbs</Text>
      </View>

      <Text style={styles.label}>Bats</Text>
      <View style={styles.chipRow}>
        {BATS_THROWS_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, bats === option && styles.chipSelected]}
            onPress={() => setBats(option)}
          >
            <Text style={styles.chipText}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Throws</Text>
      <View style={styles.chipRow}>
        {BATS_THROWS_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, throwsHand === option && styles.chipSelected]}
            onPress={() => setThrowsHand(option)}
          >
            <Text style={styles.chipText}>{option}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.success}>Saved.</Text>}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={handleSave}>
        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
        <Text style={styles.secondaryButtonText}>Back to profile</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, backgroundColor: colors.background },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, flexShrink: 1, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  success: { color: colors.success, fontSize: 15, fontWeight: "600" },
  plainText: { color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  heightRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heightInput: { width: 70 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textPrimary },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" },
  secondaryButtonText: { color: colors.textPrimary },
});

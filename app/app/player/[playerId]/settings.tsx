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
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  getPlayerProfile,
  updatePlayerSettings,
  uploadPlayerPhoto,
  type BatsThrows,
  type PlayerDisplayMode,
} from "../../../lib/playerRepository";
import { colors } from "../../../lib/theme";

const BATS_THROWS_OPTIONS: BatsThrows[] = ["Right", "Left", "Switch"];

const DISPLAY_MODE_OPTIONS: { key: PlayerDisplayMode; label: string }[] = [
  { key: "uniform", label: "Uniform #" },
  { key: "tag", label: "Alias" },
  { key: "real_name", label: "Real Name" },
];

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
  const [isCoachFallback, setIsCoachFallback] = useState(false);
  const [realName, setRealName] = useState<string | null>(null);
  const [playerTag, setPlayerTag] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "only_me">("public");
  const [displayMode, setDisplayMode] = useState<PlayerDisplayMode>("uniform");
  const [leaderboardOptOutTeam, setLeaderboardOptOutTeam] = useState(false);
  const [leaderboardOptOutLeague, setLeaderboardOptOutLeague] = useState(false);
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [bats, setBats] = useState<BatsThrows | null>(null);
  const [throwsHand, setThrowsHand] = useState<BatsThrows | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!playerId || !session) return;
    getPlayerProfile(supabase, playerId, session.user.id)
      .then((p) => {
        if (p) {
          setIsOwner(p.isOwner);
          setIsCoachFallback(p.isCoachFallback);
          setRealName(p.realName);
          setPlayerTag(p.playerTag);
          setVisibility(p.visibilityScope);
          setDisplayMode(p.displayMode);
          setLeaderboardOptOutTeam(p.leaderboardOptOutTeam);
          setLeaderboardOptOutLeague(p.leaderboardOptOutLeague);
          setHeightFeet(p.heightFeet != null ? String(p.heightFeet) : "");
          setHeightInches(p.heightInches != null ? String(p.heightInches) : "");
          setWeightLbs(p.weightLbs != null ? String(p.weightLbs) : "");
          setBats(p.bats);
          setThrowsHand(p.throws);
          setPhotoUrl(p.photoUrl);
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
        ...(isCoachFallback ? {} : { displayMode, leaderboardOptOutTeam, leaderboardOptOutLeague }),
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

  async function handlePickPhoto() {
    if (!playerId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a photo.");
      return;
    }
    // Matches card_template_final.png's own canvas ratio (1440x1930) so the
    // photo the parent picks lines up with the baseball card's photo layer
    // without extra letterboxing -- see components/PlayerCard.tsx.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1440, 1930],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    setError(null);
    try {
      const contentType = asset.mimeType ?? "image/jpeg";
      const newUrl = await uploadPlayerPhoto(supabase, playerId, asset.uri, contentType);
      setPhotoUrl(newUrl);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadingPhoto(false);
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
      <View style={styles.realNameBox}>
        <Text style={styles.realNameLabel}>Real Name (on file, not shown publicly)</Text>
        <Text style={styles.realNameValue}>{realName ?? "Not yet provided"}</Text>
      </View>

      {!isCoachFallback && (
        <>
          <Text style={styles.label}>Player Photo</Text>
          <Text style={styles.hint}>Used as the photo on this player's baseball card in the app.</Text>
          <View style={styles.photoRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={[styles.photoPreview, styles.photoPreviewEmpty]}>
                <Text style={styles.hint}>No photo yet</Text>
              </View>
            )}
            <Pressable
              style={[styles.secondaryButton, uploadingPhoto && styles.buttonDisabled]}
              disabled={uploadingPhoto}
              onPress={handlePickPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.secondaryButtonText}>{photoUrl ? "Change Photo" : "Upload Photo"}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      <Text style={styles.label}>PlayerTag</Text>
      <TextInput style={styles.input} value={playerTag} onChangeText={setPlayerTag} autoCapitalize="none" />
      <Text style={styles.hint}>Usable as a custom alias below. Must be unique.</Text>

      <Text style={styles.label}>Visibility</Text>
      <View style={styles.chipRow}>
        {(["public", "private", "only_me"] as const).map((v) => (
          <Pressable key={v} style={[styles.chip, visibility === v && styles.chipSelected]} onPress={() => setVisibility(v)}>
            <Text style={styles.chipText}>{v === "public" ? "Public" : v === "private" ? "Private" : "Only Me"}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {visibility === "public"
          ? "Stats visible to any signed-in @Batz user."
          : visibility === "private"
            ? "Stats visible only to coaches, fans, and players on this player's own team."
            : "Your player's card is still visible to everyone, but stats show as * to everyone except you."}
      </Text>

      {isCoachFallback ? (
        <Text style={styles.hint}>
          Display name and leaderboard settings unlock once a parent claims this player.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Display As</Text>
          <View style={styles.chipRow}>
            {DISPLAY_MODE_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.chip, displayMode === option.key && styles.chipSelected]}
                onPress={() => setDisplayMode(option.key)}
              >
                <Text style={styles.chipText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {displayMode === "uniform"
              ? "Shown app-wide as the player's uniform number."
              : displayMode === "tag"
                ? "Shown app-wide as the PlayerTag above."
                : "Shown app-wide as the real name on file."}
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Exclude from Team Leaderboard</Text>
            <Switch value={leaderboardOptOutTeam} onValueChange={setLeaderboardOptOutTeam} />
          </View>
          <Text style={styles.hint}>
            Keeps this player on the Roster and their own Career Profile, just off of this team's Leaderboard
            rankings.
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Exclude from League Leaderboard</Text>
            <Switch value={leaderboardOptOutLeague} onValueChange={setLeaderboardOptOutLeague} />
          </View>
          <Text style={styles.hint}>
            Keeps this player off the League/Division-wide Leaderboard rankings, independent of the Team
            Leaderboard setting above.
          </Text>
        </>
      )}

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
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, flexShrink: 1, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  success: { color: colors.success, fontSize: 15, fontFamily: "Montserrat_600SemiBold" },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  realNameBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  realNameLabel: { fontSize: 12, fontFamily: "Montserrat_400Regular", color: colors.textMuted },
  realNameValue: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", color: colors.textSecondary, marginTop: 2 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 70, height: 94, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  photoPreviewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
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
  chipText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
});

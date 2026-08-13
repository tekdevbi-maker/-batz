import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Switch, Image, BackHandler } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import {
  getPlayerProfile,
  updatePlayerSettings,
  uploadPlayerPhoto,
  type BatsThrows,
  type PlayerDisplayMode,
} from "../lib/playerRepository";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import TileSelect from "../components/TileSelect";

type VisibilityScope = "public" | "private" | "only_me";

const DISPLAY_MODE_OPTIONS: { key: PlayerDisplayMode; label: string }[] = [
  { key: "uniform", label: "Uniform #" },
  { key: "tag", label: "PlayerTag" },
  { key: "real_name", label: "Real Name" },
];

const VISIBILITY_OPTIONS: { key: VisibilityScope; label: string }[] = [
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
  { key: "only_me", label: "Only Me" },
];

const VISIBILITY_EXPLANATION: Record<VisibilityScope, string> = {
  public: "Stats visible to any signed-in @Batz user.",
  private: "Stats visible only to coaches, fans, and players on this player's own team.",
  only_me: "Your player's card is still visible to everyone, but stats show as * to everyone except you.",
};

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

// Runs right after a parent Agrees to the verification notice (see
// notifications.tsx) -- a short click-through for the settings that
// actually matter to set up front, one player at a time (playerIds is a
// comma-separated list when a coach approved/transferred several at
// once). Finishing the last player lands on their normal Player Settings
// screen, where all of this remains editable later.
//
// Once Agree is hit there is no way back to the notice or out of the
// wizard (no Back button anywhere in here) -- the player also does not
// appear under Home's "My Players" until onboarding_completed_at is
// stamped at Finish, so an abandoned wizard just leaves the player
// pending rather than half-configured but already visible.
export default function PlayerOnboardingScreen() {
  const { session } = useRequireAuth();
  const { playerIds: playerIdsParam } = useLocalSearchParams<{ playerIds: string }>();
  const router = useRouter();

  const playerIds = (playerIdsParam ?? "").split(",").filter(Boolean);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [step, setStep] = useState(1);

  const [loaded, setLoaded] = useState(false);
  const [realName, setRealName] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<PlayerDisplayMode | null>(null);
  const [visibility, setVisibility] = useState<VisibilityScope | null>(null);
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

  const currentPlayerId = playerIds[playerIndex];

  // No way out via the Android hardware back button/gesture either -- see
  // the file-level note above on why the wizard is one-way once started.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
      return () => sub.remove();
    }, [])
  );

  useEffect(() => {
    if (!currentPlayerId || !session) return;
    setLoaded(false);
    setStep(1);
    setDisplayMode(null);
    setVisibility(null);
    setError(null);
    getPlayerProfile(supabase, currentPlayerId, session.user.id)
      .then((p) => {
        if (p) {
          setRealName(p.realName);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerId, session]);

  async function handleSaveDemographics() {
    if (!currentPlayerId || !displayMode || !visibility) return;
    setSaving(true);
    setError(null);
    try {
      await updatePlayerSettings(supabase, currentPlayerId, {
        displayMode,
        visibilityScope: visibility,
        leaderboardOptOutTeam,
        leaderboardOptOutLeague,
        heightFeet: parseOptionalInt(heightFeet),
        heightInches: parseOptionalInt(heightInches),
        weightLbs: parseOptionalInt(weightLbs),
        bats,
        throws: throwsHand,
      });
      setStep(5);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePickPhoto() {
    if (!currentPlayerId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a photo.");
      return;
    }
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
      const newUrl = await uploadPlayerPhoto(supabase, currentPlayerId, asset.uri, contentType);
      setPhotoUrl(newUrl);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleFinish() {
    if (!currentPlayerId) return;
    setSaving(true);
    setError(null);
    try {
      const { error: completeError } = await supabase
        .from("player")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", currentPlayerId);
      if (completeError) throw completeError;

      if (playerIndex + 1 < playerIds.length) {
        setPlayerIndex((i) => i + 1);
      } else {
        router.replace(`/player/${currentPlayerId}/settings`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!session || playerIds.length === 0) return null;
  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
        <ScrollView contentContainerStyle={styles.container}>
          {step === 1 && (
            <>
              <Text style={styles.title}>
                The name we have on file for this player is{" "}
                <Text style={styles.emphasis}>{realName ?? "not yet provided"}</Text>. You have an option on how
                you want to be displayed. Choose an option below:
              </Text>
              <TileSelect options={DISPLAY_MODE_OPTIONS} selected={displayMode} onSelect={setDisplayMode} columns={3} />
              <Pressable
                style={[styles.button, !displayMode && styles.buttonDisabled]}
                disabled={!displayMode}
                onPress={() => setStep(2)}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.title}>Choose a privacy setting below:</Text>
              <TileSelect options={VISIBILITY_OPTIONS} selected={visibility} onSelect={setVisibility} columns={3} />
              {visibility && <Text style={styles.hint}>{VISIBILITY_EXPLANATION[visibility]}</Text>}
              <Pressable
                style={[styles.button, !visibility && styles.buttonDisabled]}
                disabled={!visibility}
                onPress={() => setStep(3)}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.title}>
                @Batz focuses on your player's hitting performance throughout the season. You are automatically
                included in your Team and League Leaderboards. However, you may always exclude yourself.
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.label}>Exclude from Team Leaderboard</Text>
                <Switch value={leaderboardOptOutTeam} onValueChange={setLeaderboardOptOutTeam} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.label}>Exclude from League Leaderboard</Text>
                <Switch value={leaderboardOptOutLeague} onValueChange={setLeaderboardOptOutLeague} />
              </View>
              <Pressable style={styles.button} onPress={() => setStep(4)}>
                <Text style={styles.buttonText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.title}>
                The information below is completely optional. These stats are included in your player's card.
              </Text>

              <Text style={styles.label}>Height</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  value={heightFeet}
                  onChangeText={setHeightFeet}
                  keyboardType="number-pad"
                  placeholder="Ft"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.plainText}>ft</Text>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  value={heightInches}
                  onChangeText={setHeightInches}
                  keyboardType="number-pad"
                  placeholder="In"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.plainText}>in</Text>
              </View>

              <Text style={styles.label}>Weight</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
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
              <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={handleSaveDemographics}>
                <Text style={styles.buttonText}>{saving ? "Saving…" : "Continue"}</Text>
              </Pressable>
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.title}>At any time, you may upload a picture.</Text>
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
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={handleFinish}>
                <Text style={styles.buttonText}>{saving ? "Saving…" : "Finish"}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 24, gap: 8, backgroundColor: colors.background, justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Montserrat_400Regular", color: colors.textPrimary, lineHeight: 25, marginBottom: 8 },
  emphasis: { fontFamily: "Montserrat_700Bold" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginTop: 8 },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallInput: { width: 70 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
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
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  photoPreview: { width: 90, height: 121, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  photoPreviewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 24 },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Image, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  getLocalPlayer,
  saveLocalPlayer,
  MAX_LOCAL_SEASONS,
  MAX_STAT_VALUE,
  type LocalPlayer,
  type LocalSeasonInput,
} from "../lib/localPlayerRepository";
import type { BatsThrows } from "../lib/playerRepository";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { logGuestFeatureEvent } from "../lib/guestAnalytics";
import CircleCropModal from "../components/CircleCropModal";
import { colors } from "../lib/theme";

// PlayerCard's own canvas is 1500x2100 — picking a photo at that same
// aspect ratio means it lines up with the card's photo window without
// letterboxing, same reasoning as the real player-photo picker.
const PHOTO_ASPECT: [number, number] = [1500, 2100];

const BATS_THROWS_OPTIONS: BatsThrows[] = ["Right", "Left", "Switch"];

function emptySeason(): LocalSeasonInput {
  return { year: "", season: "", team: "", ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0 };
}

// Digits-only, capped at a max length — shared by uniform # (2 digits) and
// the per-season stat inputs (2 digits, i.e. "double digit" per spec).
function clampDigits(text: string, maxLength: number): string {
  return text.replace(/[^0-9]/g, "").slice(0, maxLength);
}

function statField(value: number): string {
  return value === 0 ? "" : String(value);
}

function parseStatField(text: string): number {
  const digits = clampDigits(text, 2);
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : Math.min(n, MAX_STAT_VALUE);
}

export default function CreatePlayerScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  // Not useRequireAuth -- this screen is reachable signed out (guests use
  // it too), so just read whether there's a session, don't redirect on it.
  const { session } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [uniformNumber, setUniformNumber] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [bats, setBats] = useState<BatsThrows | null>(null);
  const [throwsHand, setThrowsHand] = useState<BatsThrows | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [divisionName, setDivisionName] = useState("");
  const [currentTeamName, setCurrentTeamName] = useState("");
  const [currentSeason, setCurrentSeason] = useState("");
  const [currentSeasonYear, setCurrentSeasonYear] = useState("");
  const [seasons, setSeasons] = useState<LocalSeasonInput[]>(
    Array.from({ length: MAX_LOCAL_SEASONS }, emptySeason)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [logoCropUri, setLogoCropUri] = useState<string | null>(null);
  const [croppingLogo, setCroppingLogo] = useState(false);

  // Editing reuses this same screen/form — pre-fill from the existing
  // local player instead of starting blank, and handleSave below keeps its
  // id instead of generating a new one.
  useEffect(() => {
    if (!editId) return;
    getLocalPlayer(editId).then((p) => {
      if (!p) return;
      setFirstName(p.firstName);
      setLastName(p.lastName);
      setUniformNumber(p.uniformNumber != null ? String(p.uniformNumber) : "");
      setHeightFeet(p.heightFeet != null ? String(p.heightFeet) : "");
      setHeightInches(p.heightInches != null ? String(p.heightInches) : "");
      setWeightLbs(p.weightLbs != null ? String(p.weightLbs) : "");
      setBats(p.bats);
      setThrowsHand(p.throws);
      setLeagueName(p.leagueName);
      setDivisionName(p.divisionName);
      setCurrentTeamName(p.currentTeamName);
      setCurrentSeason(p.currentSeason);
      setCurrentSeasonYear(p.currentSeasonYear);
      setCreatedAt(p.createdAt);
      setPhotoUrl(p.photoUrl);
      setTeamLogoUrl(p.teamLogoUrl);
      const filled = [...p.seasons];
      while (filled.length < MAX_LOCAL_SEASONS) filled.push(emptySeason());
      setSeasons(filled.slice(0, MAX_LOCAL_SEASONS));
    });
  }, [editId]);

  function updateSeason(index: number, patch: Partial<LocalSeasonInput>) {
    setSeasons((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // Local-only, unlike the real player-photo/team-logo pickers — the
  // picked (or, for the logo, cropped) file's own local URI is stored
  // directly, with no Supabase Storage upload step since this player never
  // leaves the device.
  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: PHOTO_ASPECT,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setError(null);
    setPhotoUrl(result.assets[0].uri);
  }

  async function handlePickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setError(null);
    setLogoCropUri(result.assets[0].uri);
  }

  async function handleConfirmLogoCrop(circleUri: string) {
    setCroppingLogo(true);
    try {
      setTeamLogoUrl(circleUri);
    } finally {
      setCroppingLogo(false);
      setLogoCropUri(null);
    }
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // A season row only counts if the parent actually filled something in
      // for it — otherwise all 3 blank rows would show up as three empty
      // "Season" entries on the card.
      const filledSeasons = seasons.filter((s) => s.season.trim() || s.team.trim() || s.year.trim());
      const player: LocalPlayer = {
        id: editId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        uniformNumber: uniformNumber ? Number.parseInt(uniformNumber, 10) : null,
        heightFeet: heightFeet ? Number.parseInt(heightFeet, 10) : null,
        heightInches: heightInches ? Number.parseInt(heightInches, 10) : null,
        weightLbs: weightLbs ? Number.parseInt(weightLbs, 10) : null,
        bats,
        throws: throwsHand,
        leagueName: leagueName.trim(),
        divisionName: divisionName.trim(),
        currentTeamName: currentTeamName.trim(),
        currentSeason: currentSeason.trim(),
        currentSeasonYear: currentSeasonYear.trim(),
        photoUrl,
        teamLogoUrl,
        seasons: filledSeasons,
        createdAt: createdAt ?? new Date().toISOString(),
      };
      await saveLocalPlayer(player);
      // Only for a genuinely new player, not every edit save.
      if (!editId) {
        logGuestFeatureEvent(supabase, "local_player_created", !session);
      }
      router.replace(`/local-player/${player.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          title: "Create A Player",
          headerRight: () => (
            <Pressable hitSlop={12} disabled={saving} onPress={handleSave}>
              {saving ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.headerSaveText}>Save</Text>}
            </Pressable>
          ),
        }}
      />

      <Text style={styles.hint}>
        A personal player card just for you — no team or coach involved. Enter stats by hand below.
      </Text>

      <Text style={styles.sectionTitle}>Player Photo</Text>
      <Pressable style={styles.photoRow} onPress={handlePickPhoto}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photoPreview} resizeMode="cover" />
        ) : (
          <View style={[styles.photoPreview, styles.photoPreviewEmpty]}>
            <Text style={styles.hint}>No photo yet</Text>
          </View>
        )}
        <Text style={styles.pickButtonText}>{photoUrl ? "Change Photo" : "Choose Photo"}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Team Logo</Text>
      <Pressable style={styles.photoRow} onPress={handlePickLogo}>
        {teamLogoUrl ? (
          <Image source={{ uri: teamLogoUrl }} style={styles.logoPreview} resizeMode="contain" />
        ) : (
          <View style={[styles.logoPreview, styles.photoPreviewEmpty]}>
            <Text style={styles.hint}>No logo</Text>
          </View>
        )}
        <Text style={styles.pickButtonText}>{teamLogoUrl ? "Change Logo" : "Choose Logo"}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Player Demographics</Text>

      <Text style={styles.label}>First Name</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />

      <Text style={styles.label}>Last Name</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />

      <Text style={styles.label}>Uniform Number</Text>
      <TextInput
        style={[styles.input, styles.smallInput]}
        value={uniformNumber}
        onChangeText={(t) => setUniformNumber(clampDigits(t, 2))}
        keyboardType="number-pad"
        placeholder="00"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Height</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.smallInput]}
          value={heightFeet}
          onChangeText={(t) => setHeightFeet(clampDigits(t, 1))}
          keyboardType="number-pad"
          placeholder="Ft"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.plainText}>ft</Text>
        <TextInput
          style={[styles.input, styles.smallInput]}
          value={heightInches}
          onChangeText={(t) => setHeightInches(clampDigits(t, 2))}
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
          onChangeText={(t) => setWeightLbs(clampDigits(t, 3))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.plainText}>lbs</Text>
      </View>

      <Text style={styles.label}>Bats</Text>
      <View style={styles.chipRow}>
        {BATS_THROWS_OPTIONS.map((option) => (
          <Pressable key={option} style={[styles.chip, bats === option && styles.chipSelected]} onPress={() => setBats(option)}>
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

      <Text style={styles.sectionTitle}>League / Team</Text>

      <Text style={styles.label}>League</Text>
      <TextInput style={styles.input} value={leagueName} onChangeText={setLeagueName} placeholder="e.g. Winter Park Babe Ruth" placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Division</Text>
      <TextInput style={styles.input} value={divisionName} onChangeText={setDivisionName} placeholder="e.g. Majors" placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Current Team</Text>
      <TextInput style={styles.input} value={currentTeamName} onChangeText={setCurrentTeamName} placeholder="e.g. Rays" placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Current Season</Text>
      <View style={styles.row}>
        <View style={styles.seasonFieldMedium}>
          <TextInput
            style={styles.input}
            value={currentSeason}
            onChangeText={setCurrentSeason}
            placeholder="Fall"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.seasonFieldSmall}>
          <TextInput
            style={styles.input}
            value={currentSeasonYear}
            onChangeText={(t) => setCurrentSeasonYear(clampDigits(t, 4))}
            keyboardType="number-pad"
            placeholder="2026"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Seasons (up to {MAX_LOCAL_SEASONS})</Text>
      {seasons.map((s, i) => (
        <View key={i} style={styles.seasonCard}>
          <Text style={styles.seasonTitle}>Season {i + 1}</Text>
          <View style={styles.row}>
            <View style={styles.seasonFieldSmall}>
              <Text style={styles.smallLabel}>Year</Text>
              <TextInput
                style={styles.input}
                value={s.year}
                onChangeText={(t) => updateSeason(i, { year: clampDigits(t, 4) })}
                keyboardType="number-pad"
                placeholder="2026"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.seasonFieldMedium}>
              <Text style={styles.smallLabel}>Season</Text>
              <TextInput
                style={styles.input}
                value={s.season}
                onChangeText={(t) => updateSeason(i, { season: t })}
                placeholder="Fall"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.seasonFieldMedium}>
              <Text style={styles.smallLabel}>Team</Text>
              <TextInput
                style={styles.input}
                value={s.team}
                onChangeText={(t) => updateSeason(i, { team: t })}
                placeholder="Team name"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.statGrid}>
            {(
              [
                ["AB", "ab"],
                ["H", "h"],
                ["2B", "doubles"],
                ["3B", "triples"],
                ["HR", "hr"],
                ["RBI", "rbi"],
                ["BB", "bb"],
              ] as const
            ).map(([label, key]) => (
              <View key={key} style={styles.statField}>
                <Text style={styles.smallLabel}>{label}</Text>
                <TextInput
                  style={[styles.input, styles.statInput]}
                  value={statField(s[key])}
                  onChangeText={(t) => updateSeason(i, { [key]: parseStatField(t) } as Partial<LocalSeasonInput>)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  maxLength={2}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} disabled={saving} onPress={handleSave}>
        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>Create Player</Text>}
      </Pressable>

      <CircleCropModal
        visible={!!logoCropUri}
        imageUri={logoCropUri}
        busy={croppingLogo}
        onCancel={() => setLogoCropUri(null)}
        onConfirm={handleConfirmLogoCrop}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, backgroundColor: colors.background },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginTop: 16, marginBottom: 4 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 70, height: 94, borderRadius: 8, backgroundColor: colors.surface },
  logoPreview: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surface },
  photoPreviewEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  pickButtonText: { color: colors.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 14 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 10, color: colors.textPrimary },
  smallLabel: { fontSize: 12, fontFamily: "Montserrat_600SemiBold", color: colors.textSecondary, marginBottom: 2 },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  smallInput: { width: 70 },
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
  seasonCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
    backgroundColor: colors.surface,
  },
  seasonTitle: { fontSize: 14, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  seasonFieldSmall: { width: 70 },
  seasonFieldMedium: { flex: 1 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statField: { width: 60 },
  statInput: { width: 60, paddingHorizontal: 8, textAlign: "center" },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  headerSaveText: { color: colors.accent, fontFamily: "Montserrat_700Bold", fontSize: 16, paddingHorizontal: 4 },
});

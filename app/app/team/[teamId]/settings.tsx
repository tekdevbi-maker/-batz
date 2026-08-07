import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, Image, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { updateTeamName, uploadTeamLogo, markSeasonEnded } from "../../../lib/teamsRepository";
import { colors } from "../../../lib/theme";
import CircleCropModal from "../../../components/CircleCropModal";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function TeamSettingsScreen() {
  useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<string>("in_season");
  const [endingSeason, setEndingSeason] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!teamId) return;
      supabase
        .from("team")
        .select("name, logo_url, season_status")
        .eq("id", teamId)
        .single()
        .then(({ data, error: err }) => {
          if (err) {
            setError(errorMessage(err));
          } else {
            setName(data.name);
            setLogoUrl(data.logo_url);
            setSeasonStatus(data.season_status);
          }
          setLoaded(true);
        });
    }, [teamId])
  );

  function confirmEndSeason() {
    Alert.alert(
      "Mark season complete?",
      `${name} will move to Previous Teams. This can't be undone from here.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Complete",
          style: "destructive",
          onPress: async () => {
            if (!teamId) return;
            setEndingSeason(true);
            setError(null);
            try {
              await markSeasonEnded(supabase, teamId);
              setSeasonStatus("ended");
              router.replace("/");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setEndingSeason(false);
            }
          },
        },
      ]
    );
  }

  async function handleSaveName() {
    if (!teamId || !name.trim()) return;
    setSavingName(true);
    setError(null);
    setNameSaved(false);
    try {
      await updateTeamName(supabase, teamId, name.trim());
      setNameSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  }

  async function handlePickLogo() {
    if (!teamId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a logo.");
      return;
    }
    // Square crop here is just the source rect the circular-crop modal
    // clips down further -- the actual circular masking happens there,
    // since the OS picker has no circular-crop mode.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setError(null);
    setCropImageUri(result.assets[0].uri);
  }

  async function handleConfirmCrop(circleUri: string) {
    if (!teamId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const newUrl = await uploadTeamLogo(supabase, teamId, circleUri, "image/png");
      setLogoUrl(newUrl);
      setCropImageUri(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  if (!teamId) return null;

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Team Logo</Text>
      <Pressable style={styles.logoPicker} onPress={handlePickLogo} disabled={uploadingLogo}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="cover" />
        ) : (
          <Text style={styles.logoPlaceholderText}>No logo yet</Text>
        )}
        {uploadingLogo && (
          <View style={styles.logoOverlay}>
            <ActivityIndicator color="white" />
          </View>
        )}
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={handlePickLogo} disabled={uploadingLogo}>
        <Text style={styles.secondaryButtonText}>{logoUrl ? "Change Logo" : "Upload Logo"}</Text>
      </Pressable>

      <Text style={styles.label}>Team Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameSaved(false);
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {nameSaved && <Text style={styles.success}>Saved.</Text>}
      <Pressable
        style={[styles.button, (!name.trim() || savingName) && styles.buttonDisabled]}
        disabled={!name.trim() || savingName}
        onPress={handleSaveName}
      >
        {savingName ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save Name</Text>}
      </Pressable>

      <Text style={styles.label}>Season</Text>
      {seasonStatus === "ended" ? (
        <Text style={styles.hint}>This team's season is complete -- it's in Previous Teams on Home.</Text>
      ) : (
        <>
          <Text style={styles.hint}>
            Once the season is over, mark it complete to move this team to Previous Teams on Home.
          </Text>
          <Pressable
            style={[styles.dangerButton, endingSeason && styles.buttonDisabled]}
            disabled={endingSeason}
            onPress={confirmEndSeason}
          >
            {endingSeason ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Mark Season Complete</Text>
            )}
          </Pressable>
        </>
      )}

      <CircleCropModal
        visible={cropImageUri !== null}
        imageUri={cropImageUri}
        busy={uploadingLogo}
        onCancel={() => setCropImageUri(null)}
        onConfirm={handleConfirmCrop}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular", marginBottom: 4 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  success: { color: colors.success, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  logoPicker: {
    width: 140,
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: "100%", height: "100%" },
  logoPlaceholderText: { color: colors.textMuted, fontSize: 13, fontFamily: "Montserrat_400Regular", textAlign: "center", paddingHorizontal: 8 },
  logoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  dangerButton: { backgroundColor: colors.danger, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold" },
});

import { useCallback, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { markSeasonEnded, isHeadCoachOnTeam } from "../../../lib/teamsRepository";
import { exportSeasonTotalsCsv } from "../../../lib/gamesRepository";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function TeamSettingsScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<string>("in_season");
  const [endingSeason, setEndingSeason] = useState(false);
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!teamId || !session) return;
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
      isHeadCoachOnTeam(supabase, teamId, session.user.id).then(setIsHeadCoach).catch(() => {});
    }, [teamId, session])
  );

  function confirmEndSeason() {
    Alert.alert(
      "Mark season complete?",
      `${name} will move to Previous Teams. A Season Totals CSV (every player, summed) will save to your phone first for your records. This can't be undone from here.`,
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
              // Must happen before markSeasonEnded -- that RPC deletes
              // unclaimed roster spots' names/stats once it folds them
              // into the team's anonymized total, so this is the last
              // chance to capture everyone's real names in one file.
              const { fileName, csvText } = await exportSeasonTotalsCsv(supabase, teamId);
              const mimeType = "text/csv";
              if (Platform.OS === "android") {
                const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permission.granted) {
                  setError("Season Totals CSV wasn't saved -- season not marked complete. Try again when ready.");
                  return;
                }
                const fileUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
                  permission.directoryUri,
                  fileName.replace(/\.csv$/, ""),
                  mimeType
                );
                await LegacyFileSystem.writeAsStringAsync(fileUri, csvText, {
                  encoding: LegacyFileSystem.EncodingType.UTF8,
                });
              } else {
                const path = `${LegacyFileSystem.cacheDirectory}${fileName}`;
                await LegacyFileSystem.writeAsStringAsync(path, csvText, {
                  encoding: LegacyFileSystem.EncodingType.UTF8,
                });
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(path, { mimeType, dialogTitle: "Save this season's totals" });
                }
              }

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
      <View style={styles.logoPicker}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="cover" />
        ) : (
          <Text style={styles.logoPlaceholderText}>No logo yet -- upload one from Team Home</Text>
        )}
      </View>

      <Text style={styles.label}>Team Name</Text>
      <Text style={styles.readOnlyValue}>{name}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {isHeadCoach && (
        <>
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular", marginBottom: 4 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  readOnlyValue: { fontSize: 18, fontFamily: "Montserrat_400Regular", color: colors.textPrimary },
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
  dangerButton: { backgroundColor: colors.danger, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from "react-native";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMySeasonTotals, downloadSeasonTotalsCsvText, type SeasonTotalsFile } from "../lib/gamesRepository";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Season Totals CSVs now save straight to the head coach's account (see
// team/[teamId]/settings.tsx's confirmEndSeason) instead of the device at
// the moment a season ends -- this screen is where the coach comes back to
// pull one up later, on whatever device they're on. Sharing a file still
// needs a real on-device path, so that part only happens here, on demand,
// not automatically at season-end.
export default function SeasonTotalsScreen() {
  const { session } = useRequireAuth();

  const [files, setFiles] = useState<SeasonTotalsFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharingPath, setSharingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listMySeasonTotals(supabase, session.user.id)
      .then(setFiles)
      .catch((err) => setError(errorMessage(err)));
  }, [session]);

  async function handleShare(file: SeasonTotalsFile) {
    setSharingPath(file.path);
    setError(null);
    try {
      const csvText = await downloadSeasonTotalsCsvText(supabase, file.path);
      const localPath = `${LegacyFileSystem.cacheDirectory}${file.name}`;
      await LegacyFileSystem.writeAsStringAsync(localPath, csvText, {
        encoding: LegacyFileSystem.EncodingType.UTF8,
      });
      if (Platform.OS === "android") {
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permission.granted) {
          const destUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            file.name.replace(/\.csv$/, ""),
            "text/csv"
          );
          await LegacyFileSystem.writeAsStringAsync(destUri, csvText, {
            encoding: LegacyFileSystem.EncodingType.UTF8,
          });
        }
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localPath, { mimeType: "text/csv", dialogTitle: file.name });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSharingPath(null);
    }
  }

  if (!session) return null;

  return (
    <>
      <SafeTopSpacer />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Season Totals</Text>
        <Text style={styles.hint}>
          Every Season Totals CSV you've saved when marking a season complete, kept on your @Batz account.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {!files && !error && <ActivityIndicator style={styles.spacer} />}
        {files && files.length === 0 && <Text style={styles.hint}>No Season Totals saved yet.</Text>}

        {files?.map((f) => (
          <View key={f.path} style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {f.name}
            </Text>
            <Pressable
              style={styles.button}
              disabled={sharingPath === f.path}
              onPress={() => handleShare(f)}
            >
              {sharingPath === f.path ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Save to device</Text>
              )}
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 12, lineHeight: 20 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  spacer: { marginTop: 24 },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
    gap: 12,
  },
  fileName: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 14, flexShrink: 1 },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 13 },
});

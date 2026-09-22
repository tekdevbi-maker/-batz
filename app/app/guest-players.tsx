import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl } from "react-native";
import { Link, useRouter, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listLocalPlayers, type LocalPlayer } from "../lib/localPlayerRepository";
import { supabase } from "../lib/supabase";
import { logGuestFeatureEvent } from "../lib/guestAnalytics";
import PlayerCard from "../components/PlayerCard";
import { colors } from "../lib/theme";

// The guest landing page for the fully local "Create A Player" feature --
// no sign-in required at all, since these players never touch Supabase.
// Signed-in users get the same feature from a section on Home instead
// (see app/index.tsx's "My Custom Players"); this screen exists so someone
// who never creates an account still has a place to reach it, linked from
// login.tsx's "Continue as Guest".
export default function GuestPlayersScreen() {
  const router = useRouter();
  const [localPlayers, setLocalPlayers] = useState<LocalPlayer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listLocalPlayers().then(setLocalPlayers).catch(() => {});
  }, []);

  useFocusEffect(load);

  // Once per mount, not on every refocus -- otherwise flipping back to this
  // screen repeatedly in one session would inflate the count.
  useEffect(() => {
    logGuestFeatureEvent(supabase, "guest_players_viewed", true);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <Image source={require("../assets/wordmark-transparent.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Try Out Our Baseball Card Generator!</Text>
      <Text style={styles.hint}>
        No account needed! Create your very own print-ready 2.5" x 3.5" @Batz baseball card complete with stats in
        the back!
      </Text>
      <Text style={styles.hintItalic}>
        This is completely separate from any team you or your child may be a part of. Team players require an
        account to protect their privacy.
      </Text>

      <View style={styles.tileGrid}>
        {localPlayers.map((p) => (
          <Pressable key={p.id} style={styles.playerPhotoTile} onPress={() => router.push(`/local-player/${p.id}`)}>
            <PlayerCard firstName={p.firstName} lastName={p.lastName} photoUrl={p.photoUrl} teamLogoUrl={p.teamLogoUrl} cardSet="freecard" />
          </Pressable>
        ))}
        <Pressable style={styles.createPlayerTile} onPress={() => router.push("/create-player")}>
          <Ionicons name="add-circle-outline" size={32} color={colors.accent} />
          <Text style={styles.createPlayerTileText}>Create A Player</Text>
        </Pressable>
      </View>

      <Pressable style={styles.signUpButton} onPress={() => router.push("/sign-up")}>
        <Text style={styles.signUpButtonText}>Sign Up for Full Access</Text>
      </Pressable>
      <Pressable onPress={() => router.push("/login")}>
        <Text style={styles.loginLink}>Already have an account? Log in</Text>
      </Pressable>

      <Text style={styles.legalText}>
        By using this feature, you agree to our{" "}
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12, flexGrow: 1 },
  logo: { width: 220, height: 98, alignSelf: "center" },
  title: { fontSize: 20, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", textAlign: "center", fontSize: 13 },
  hintItalic: {
    color: colors.textSecondary,
    fontFamily: "Montserrat_400Regular",
    fontStyle: "italic",
    textAlign: "center",
    fontSize: 13,
  },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 12 },
  playerPhotoTile: { width: "31.5%", borderRadius: 8, overflow: "hidden", marginBottom: 12 },
  createPlayerTile: {
    width: "31.5%",
    aspectRatio: 0.7143,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 8,
    marginBottom: 12,
  },
  createPlayerTileText: { fontSize: 12, fontFamily: "Montserrat_600SemiBold", color: colors.accent, textAlign: "center" },
  signUpButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  signUpButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  loginLink: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 13, textAlign: "center", marginTop: 12 },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 12, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  legalLink: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
});

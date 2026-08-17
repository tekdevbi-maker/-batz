import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from "@expo-google-fonts/montserrat";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import AdBanner from "../components/AdBanner";
import SlimHeader from "../components/SlimHeader";

// NOTE: an app-wide default via Text.defaultProps/TextInput.defaultProps
// was tried here and reverted -- it's an undocumented hack that isn't
// supported under React Native's New Architecture (Fabric, which this app
// runs on) and caused a native SIGSEGV crash on launch. Montserrat is
// applied per-style instead (see the fontFamily entries alongside
// fontWeight across the app, added in the codemod pass) -- safe, just not
// automatically covering styles that never set fontWeight at all.

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <>
      <AdBanner />
      <ImpersonationBanner />
      {children}
    </>
  );
}

// Persistent reminder that the active session belongs to another user,
// not the admin -- shown above everything else while impersonating, with
// a one-tap way back that restores the stashed admin session instead of
// requiring a re-login.
function ImpersonationBanner() {
  const { impersonatingEmail, returnToAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  if (!impersonatingEmail) return null;
  return (
    <View style={[bannerStyles.banner, { paddingTop: insets.top + 8 }]}>
      <Text style={bannerStyles.text} numberOfLines={1}>
        Viewing as {impersonatingEmail}
      </Text>
      <Pressable style={bannerStyles.button} onPress={() => returnToAdmin()}>
        <Text style={bannerStyles.buttonText}>Return to Admin</Text>
      </Pressable>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.warningBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  text: { flex: 1, color: colors.warningText, fontFamily: "Montserrat_600SemiBold", fontSize: 13 },
  button: { borderWidth: 1, borderColor: colors.warningText, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  buttonText: { color: colors.warningText, fontFamily: "Montserrat_700Bold", fontSize: 12 },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Anton_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <Gate>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            header: (props) => <SlimHeader {...props} />,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
          <Stack.Screen name="dev-register" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-intro" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-bucketing" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-coppa" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-league" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-sport" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-recball" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-division" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-season" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-active-check" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-teamname" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-confirm" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-complete" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-complete-link" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-complete-followers" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-complete-multiteam" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="dev-register-complete-final" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="player-onboarding" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="register-team" options={{ title: "Start a New Team as Head Coach" }} />
          <Stack.Screen name="previous-teams" options={{ title: "" }} />
          <Stack.Screen name="join-team" options={{ title: "" }} />
          <Stack.Screen name="import-game" options={{ title: "Import a Game" }} />
          <Stack.Screen name="live-score-setup" options={{ title: "Live Scoring" }} />
          <Stack.Screen name="live-score-game-info" options={{ title: "Live Scoring" }} />
          <Stack.Screen name="live-score" options={{ title: "Live Scoring" }} />
          <Stack.Screen name="live-score-summary" options={{ title: "Game Summary" }} />
          <Stack.Screen name="shared-csv" options={{ title: "Import Game" }} />
          <Stack.Screen name="admin" options={{ title: "League/Division Admin" }} />
          <Stack.Screen name="join/[teamId]" options={{ title: "Join Team" }} />
          <Stack.Screen name="team/[teamId]" options={{ headerShown: false }} />
          <Stack.Screen name="player/[playerId]/index" options={{ title: "" }} />
          <Stack.Screen name="player/[playerId]/settings" options={{ title: "Player Settings" }} />
          <Stack.Screen name="search" options={{ title: "Search" }} />
          <Stack.Screen name="user-settings" options={{ title: "User Settings" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="customer-care" options={{ title: "" }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ title: "Reset Password" }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
          <Stack.Screen name="terms-of-service" options={{ headerShown: false }} />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";

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
  text: { flex: 1, color: colors.warningText, fontWeight: "600", fontSize: 13 },
  button: { borderWidth: 1, borderColor: colors.warningText, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  buttonText: { color: colors.warningText, fontWeight: "700", fontSize: 12 },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { color: colors.textPrimary },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "@Batz" }} />
          <Stack.Screen name="login" options={{ title: "Log In" }} />
          <Stack.Screen name="coach-register" options={{ title: "Register as Coach" }} />
          <Stack.Screen name="register-team" options={{ title: "Register a New Team" }} />
          <Stack.Screen name="join-team" options={{ title: "Join a Team" }} />
          <Stack.Screen name="import-game" options={{ title: "Import a Game" }} />
          <Stack.Screen name="shared-csv" options={{ title: "Import Game" }} />
          <Stack.Screen name="admin" options={{ title: "League/Division Admin" }} />
          <Stack.Screen name="join/[teamId]" options={{ title: "Join Team" }} />
          <Stack.Screen name="team/[teamId]" options={{ headerShown: false }} />
          <Stack.Screen name="player/[playerId]/index" options={{ title: "Player" }} />
          <Stack.Screen name="player/[playerId]/settings" options={{ title: "Player Settings" }} />
          <Stack.Screen name="search" options={{ title: "Search" }} />
          <Stack.Screen name="activity" options={{ title: "Activity Feed" }} />
          <Stack.Screen name="customer-care" options={{ title: "Customer Care" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Forgot Password" }} />
          <Stack.Screen name="reset-password" options={{ title: "Reset Password" }} />
          <Stack.Screen name="privacy-policy" options={{ title: "Privacy Policy" }} />
          <Stack.Screen name="terms-of-service" options={{ title: "Terms of Service" }} />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}

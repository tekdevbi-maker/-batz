import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Image } from "react-native";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import BackButton from "../components/BackButton";

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <>{children}</>;
}

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
            headerBackButtonDisplayMode: "minimal",
            headerLeft: (props) => <BackButton canGoBack={props.canGoBack} />,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerTitle: () => (
                <Image
                  source={require("../assets/wordmark-transparent.png")}
                  style={{ width: 81, height: 36 }}
                  resizeMode="contain"
                />
              ),
            }}
          />
          <Stack.Screen name="login" options={{ title: "Log In" }} />
          <Stack.Screen name="coach-register" options={{ title: "Register as Coach" }} />
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
          <Stack.Screen name="coach-join/[teamId]" options={{ title: "Join as Coach" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Forgot Password" }} />
          <Stack.Screen name="reset-password" options={{ title: "Reset Password" }} />
          <Stack.Screen name="privacy-policy" options={{ title: "Privacy Policy" }} />
          <Stack.Screen name="terms-of-service" options={{ title: "Terms of Service" }} />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}

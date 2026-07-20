import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "../lib/AuthContext";

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate>
        <Stack>
          <Stack.Screen name="index" options={{ title: "@Batz" }} />
          <Stack.Screen name="login" options={{ title: "Log In" }} />
          <Stack.Screen name="coach-register" options={{ title: "Register as Coach" }} />
          <Stack.Screen name="import-game" options={{ title: "Import a Game" }} />
          <Stack.Screen name="shared-csv" options={{ title: "Import Game" }} />
          <Stack.Screen name="admin" options={{ title: "League/Division Admin" }} />
          <Stack.Screen name="join/[teamId]" options={{ title: "Join Team" }} />
          <Stack.Screen name="team/[teamId]/index" options={{ title: "Team" }} />
          <Stack.Screen name="team/[teamId]/games/index" options={{ title: "Game Log" }} />
          <Stack.Screen name="team/[teamId]/games/[gameId]" options={{ title: "Box Score" }} />
          <Stack.Screen name="player/[playerId]/index" options={{ title: "Player" }} />
          <Stack.Screen name="player/[playerId]/settings" options={{ title: "Player Settings" }} />
          <Stack.Screen name="search" options={{ title: "Search" }} />
          <Stack.Screen name="activity" options={{ title: "Activity Feed" }} />
          <Stack.Screen name="team/[teamId]/leaderboard" options={{ title: "Team Leaderboard" }} />
          <Stack.Screen name="coach-join/[teamId]" options={{ title: "Join as Coach" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Forgot Password" }} />
          <Stack.Screen name="reset-password" options={{ title: "Reset Password" }} />
          <Stack.Screen name="team/[teamId]/customer-care" options={{ title: "Customer Care" }} />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}

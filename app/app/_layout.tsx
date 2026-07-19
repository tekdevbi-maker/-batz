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
          <Stack.Screen name="admin" options={{ title: "League/Division Admin" }} />
          <Stack.Screen name="join/[teamId]" options={{ title: "Join Team" }} />
        </Stack>
      </Gate>
    </AuthProvider>
  );
}

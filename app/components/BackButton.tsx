import { Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";

// Custom header back button: white circle, red arrow, icon only -- no
// back-title label text next to it (the default on iOS). expo-router's
// native-stack headerLeft only passes canGoBack (no onPress on this fork),
// so navigation itself goes through useRouter().back().
export default function BackButton({ canGoBack }: { canGoBack?: boolean }) {
  const router = useRouter();
  if (!canGoBack) return null;
  return (
    <Pressable onPress={() => router.back()} hitSlop={10} style={styles.circle}>
      <Text style={styles.arrow}>←</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  arrow: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: "700",
  },
});

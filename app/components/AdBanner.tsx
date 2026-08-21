import { View, Text, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

// Screens with no reserved-ad space -- currently just Log In, which is
// deliberately kept minimal/distraction-free.
const HIDDEN_ON = new Set([
  "/login",
  "/forgot-password",
  "/sign-up",
  "/coach-register",
  "/coach-register-team",
  "/dev-register",
  "/dev-register-intro",
  "/dev-register-league",
  "/dev-register-sport",
  "/dev-register-recball",
  "/dev-register-division",
  "/dev-register-season",
  "/dev-register-teamname",
  "/dev-register-confirm",
  "/dev-register-complete",
  "/dev-register-complete-link",
  "/dev-register-complete-followers",
  "/dev-register-complete-multiteam",
  "/dev-register-complete-final",
  "/terms-of-service",
  "/privacy-policy",
]);

// Non-functional placeholder reserving the top of every screen for a
// future real ad SDK -- no ad network account exists yet, so this is
// deliberately just reserved space, not a real integration.
export default function AdBanner() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (HIDDEN_ON.has(pathname)) return null;
  return (
    <View style={[styles.adBanner, { paddingTop: insets.top }]}>
      <Text style={styles.adBannerText}>Ad space reserved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  adBanner: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  adBannerText: { color: colors.textMuted, fontSize: 12, fontFamily: "Montserrat_400Regular" },
});

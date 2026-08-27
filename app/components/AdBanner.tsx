import { View, StyleSheet } from "react-native";
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
// deliberately just reserved space, not a real integration. Kept
// visually blank (no debug label) since this is user-facing -- a
// "Ad space reserved" text would show up in store screenshots and look
// broken, and is confusing next to the "no ads yet" declarations in the
// store's data-safety/privacy forms.
export default function AdBanner() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (HIDDEN_ON.has(pathname)) return null;
  return <View style={[styles.adBanner, { height: insets.top + BANNER_HEIGHT }]} />;
}

const BANNER_HEIGHT = 50;

const styles = StyleSheet.create({
  adBanner: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});

import { View, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { colors } from "../lib/theme";
import { BANNER_AD_UNIT_ID } from "../lib/ads";

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

// Reserves the top of every screen for an AdMob banner -- every request
// through this SDK is tagged child-directed (see lib/ads.ts's
// setRequestConfiguration, called once at app startup) since @Batz shows
// youth players' data. The safe-area inset is a separate spacer above the
// ad itself so the banner never sits under the notch/status bar.
export default function AdBanner() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (HIDDEN_ON.has(pathname)) return null;
  return (
    <View style={styles.adBanner}>
      <View style={{ height: insets.top }} />
      <BannerAd unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  adBanner: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: "center",
  },
});

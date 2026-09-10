import { Platform } from "react-native";
import mobileAds, { MaxAdContentRating, TestIds } from "react-native-google-mobile-ads";

// @Batz shows youth players' data and is a COPPA-relevant app -- every ad
// request must be tagged child-directed / under-age-of-consent so AdMob
// serves contextual-only ads and never builds a behavioral targeting
// profile (device ID, cross-app activity, etc.) from these requests. See
// the "AdMob must be child-directed" project memory -- this flag has to be
// set before mobileAds().initialize() is ever called, not bolted on later.
export async function initAds(): Promise<void> {
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.G,
    tagForChildDirectedTreatment: true,
    tagForUnderAgeOfConsent: true,
  });
  await mobileAds().initialize();
}

// Real Banner Ad Unit IDs from the AdMob dashboard. Only used in
// production builds -- __DEV__ (Expo dev client / local builds) always
// gets Google's test unit instead, so ad requests made while actively
// developing never risk hitting a real advertiser or skewing @Batz's own
// AdMob metrics.
const REAL_BANNER_AD_UNIT_ID = Platform.select({
  ios: "ca-app-pub-3185604672137905/4764799522",
  android: "ca-app-pub-3185604672137905/9658033559",
  default: TestIds.BANNER,
});

export const BANNER_AD_UNIT_ID = __DEV__ ? TestIds.BANNER : (REAL_BANNER_AD_UNIT_ID as string);

import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

// A fixed (non-scrolling) block covering the status bar's height, for
// screens with headerShown:false -- without it, a ScrollView's content
// slides up underneath the phone's time/battery status bar instead of
// stopping below it, since there's no header anymore to reserve that
// space automatically.
export default function SafeTopSpacer() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: colors.background }} />;
}

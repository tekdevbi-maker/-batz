import { View, Text, Pressable, StyleSheet } from "react-native";
import type { NativeStackHeaderProps } from "expo-router";
import { colors } from "../lib/theme";

// Replaces the native header (fixed OS-chrome height, ~56dp Android /
// 44pt+ iOS, not something headerStyle can shrink) with a JS-rendered bar
// sized just a little taller than its own title text -- set once via
// screenOptions.header in each Stack, not per screen.
//
// No top safe-area padding here: AdBanner (rendered once, above every
// screen, in app/_layout.tsx's Gate) already consumes the status-bar
// inset via its own paddingTop, and every screen where this header
// actually renders sits below AdBanner -- adding insets.top again here
// double-counted the status bar and was what made the bar look thick.
const BAR_HEIGHT = 40;
const TITLE_SIZE = 18;

export default function SlimHeader({ options, navigation }: NativeStackHeaderProps) {
  const canGoBack = navigation.canGoBack();
  const title = typeof options.title === "string" ? options.title : "";

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {canGoBack && (
            <Pressable hitSlop={12} onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.side} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  bar: { height: BAR_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  side: { width: 44, justifyContent: "center" },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  backArrow: { fontSize: 26, color: colors.textPrimary, lineHeight: 26 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: TITLE_SIZE,
    fontFamily: "Montserrat_400Regular",
    color: colors.textPrimary,
  },
});

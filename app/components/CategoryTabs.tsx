import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// A single-row, equal-width, connected segmented control -- used by both
// leaderboard screens to pick the ranked stat category. Long labels (e.g.
// "Walks") shrink to fit via adjustsFontSizeToFit rather than wrapping,
// since wrapping would break the equal-height row.
export default function CategoryTabs<T extends string>({
  categories,
  selectedKey,
  onSelect,
}: {
  categories: readonly { key: T; label: string }[];
  selectedKey: T | null;
  onSelect: (key: T) => void;
}) {
  return (
    <View style={styles.row}>
      {categories.map((c, i) => (
        <Pressable
          key={c.key}
          style={[
            styles.tab,
            i < categories.length - 1 && styles.tabDivider,
            selectedKey === c.key && styles.tabSelected,
          ]}
          onPress={() => onSelect(c.key)}
        >
          <Text
            style={[styles.label, selectedKey === c.key && styles.labelSelected]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {c.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  tabDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  tabSelected: {
    backgroundColor: colors.accentMuted,
  },
  label: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  labelSelected: {
    color: colors.accent,
    fontWeight: "700",
  },
});

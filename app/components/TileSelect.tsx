import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// Generic wrapping tile grid for single-choice pickers with more options
// than CategoryTabs' single-row segmented control comfortably fits (e.g. a
// 3-per-row age-division grid). `columns` controls how many tiles fit per
// row; tiles wrap to as many rows as needed.
export default function TileSelect<T extends string>({
  options,
  selected,
  onSelect,
  columns = 3,
}: {
  options: readonly { key: T; label: string }[];
  selected: T | null;
  onSelect: (key: T) => void;
  columns?: number;
}) {
  const widthPct = `${100 / columns - 2}%` as const;
  return (
    <View style={styles.grid}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.tile, { width: widthPct }, selected === o.key && styles.tileSelected]}
          onPress={() => onSelect(o.key)}
        >
          <Text style={[styles.label, selected === o.key && styles.labelSelected]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  tile: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  tileSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  label: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  labelSelected: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
});

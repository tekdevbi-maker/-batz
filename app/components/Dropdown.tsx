import { useState } from "react";
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// A modal-based dropdown -- deliberately not the native
// @react-native-picker/picker, which would add a new native module and
// require a prebuild/rebuild cycle. This is pure JS (Modal + FlatList,
// both already part of react-native), so it drops in with a plain reload.
export default function Dropdown<T extends string | number>({
  label,
  options,
  optionLabels,
  selected,
  onSelect,
  placeholder = "Select...",
}: {
  label: string;
  options: readonly T[];
  optionLabels?: Partial<Record<T, string>>;
  selected: T | null;
  onSelect: (value: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = selected != null ? optionLabels?.[selected] ?? String(selected) : null;

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={selectedLabel ? styles.fieldText : styles.placeholderText}>
          {selectedLabel ?? placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options as T[]}
              keyExtractor={(item) => String(item)}
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item === selected && styles.optionSelected]}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, item === selected && styles.optionTextSelected]}>
                    {optionLabels?.[item] ?? String(item)}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldText: { fontSize: 18, color: colors.textPrimary },
  placeholderText: { fontSize: 18, color: colors.textMuted },
  chevron: { fontSize: 14, color: colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: 12,
    maxHeight: "70%",
    padding: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  list: { flexGrow: 0 },
  option: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  optionSelected: { backgroundColor: colors.accentMuted },
  optionText: { fontSize: 16, color: colors.textPrimary },
  optionTextSelected: { color: colors.accent, fontWeight: "600" },
});

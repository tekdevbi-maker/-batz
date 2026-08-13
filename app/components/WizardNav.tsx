import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// Shared Back/Next footer for the DEV registration wizard's 11 screens.
// onNext omitted entirely hides the Next button (pages where a tile
// selection auto-advances instead of using an explicit Next tap). onBack
// omitted hides Back too -- for a page where going back doesn't make
// sense (e.g. right after email verification, where "back" would just
// land on the now-consumed code-entry screen).
// `centered` opts into a middle-aligned row of auto-width buttons instead
// of the default two-flex-1-buttons-spanning-the-row layout -- scoped per
// screen rather than changed globally.
export default function WizardNav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Next",
  centered = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  centered?: boolean;
}) {
  return (
    <View style={[styles.row, centered && styles.rowCentered]}>
      {onBack && (
        <Pressable style={[styles.backButton, centered && styles.buttonAutoWidth]} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      )}
      {onNext && (
        <Pressable
          style={[styles.nextButton, centered && styles.buttonAutoWidth, nextDisabled && styles.nextDisabled]}
          disabled={nextDisabled}
          onPress={onNext}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginTop: 24 },
  rowCentered: { justifyContent: "center", alignItems: "center" },
  buttonAutoWidth: { flex: 0, paddingHorizontal: 28 },
  backButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  backText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  nextButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  nextDisabled: { backgroundColor: colors.accentDisabled },
  nextText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
});

import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "../lib/theme";

// Shown as the last step before any account is actually created (sign-up,
// coach-register-team's "Complete Registration", join/[teamId]'s "Continue")
// -- COPPA-driven: @Batz accounts require the holder to be 13+, and this is
// the one place that's actually asked and recorded, not just stated in the
// Terms of Service.
export default function AgeAttestationGate({
  onConfirm,
  onCancel,
  confirming,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  error?: string | null;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Your Age</Text>
      <Text style={styles.body}>You must be at least 13 years old to have an @Batz account.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.confirmButton, confirming && styles.buttonDisabled]}
        disabled={confirming}
        onPress={onConfirm}
      >
        {confirming ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.confirmButtonText}>I attest I am at least 13 years old. Create my account</Text>
        )}
      </Pressable>
      <Pressable style={styles.cancelButton} disabled={confirming} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel Registration</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  body: { fontSize: 16, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 22 },
  error: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.error },
  confirmButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  confirmButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16, textAlign: "center" },
  cancelButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  cancelButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
});

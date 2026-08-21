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
          <View style={styles.confirmButtonContent}>
            <Text style={styles.confirmButtonTextLeft}>
              I certify that I am 13 years of age or older, and I consent to the collection of my account
              data in accordance with the Privacy Policy.
            </Text>
            <Text style={styles.confirmButtonTextCenter}>Create My Account</Text>
          </View>
        )}
      </Pressable>
      <Pressable style={styles.cancelButton} disabled={confirming} onPress={onCancel}>
        <View style={styles.cancelButtonContent}>
          <Text style={styles.cancelButtonTextLeft}>No, I'm under 13.</Text>
          <Text style={styles.cancelButtonTextCenter}>Cancel Registration</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  body: { fontSize: 16, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 22, textAlign: "center" },
  error: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.error, textAlign: "center" },
  confirmButton: { width: "100%", maxWidth: 400, backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  confirmButtonContent: { width: "100%", gap: 12 },
  confirmButtonTextLeft: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16, textAlign: "left" },
  confirmButtonTextCenter: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16, textAlign: "center" },
  cancelButton: { width: "100%", maxWidth: 400, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  cancelButtonContent: { width: "100%", gap: 12 },
  cancelButtonTextLeft: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16, textAlign: "left" },
  cancelButtonTextCenter: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16, textAlign: "center" },
});

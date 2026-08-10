import { Text, StyleSheet, ScrollView, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, resetDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";

// Page 11 of 11, sub-page 5 (final): wrap-up + hand-off to the app.
export default function DevRegisterCompleteFinalScreen() {
  const router = useRouter();
  const state = getDevWizardState();

  function handleDone() {
    resetDevWizardState();
    router.replace("/");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>Good Luck this season! Go {state.teamName}!</Text>

        <View style={styles.spacer} />
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleDone}>
          <Text style={styles.buttonText}>Go to Home Screen</Text>
        </Pressable>
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4, justifyContent: "center" },
  body: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  spacer: { minHeight: 24 },
  backButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  backText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});

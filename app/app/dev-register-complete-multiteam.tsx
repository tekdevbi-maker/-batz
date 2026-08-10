import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 11 of 11, sub-page 4: multi-team Head Coach explainer.
// TODO(backlog): drop a real screenshot of the "I'm the Head Coach of
// another team" Main Menu option into the placeholder box below once
// available.
export default function DevRegisterCompleteMultiTeamScreen() {
  const router = useRouter();

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>
          If you are the Head Coach of another team, select "+ Another Team as Head Coach" in the @Batz
          Main Menu.
        </Text>

        <View style={styles.screenshotPlaceholder}>
          <Text style={styles.screenshotLabel}>Screenshot coming soon</Text>
        </View>

        <View style={styles.spacer} />
        <WizardNav onBack={() => router.back()} onNext={() => router.push("/dev-register-complete-final")} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4, justifyContent: "center" },
  body: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  screenshotPlaceholder: {
    height: 220,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  screenshotLabel: { color: colors.textMuted, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  spacer: { minHeight: 24 },
});

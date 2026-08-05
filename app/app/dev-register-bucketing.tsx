import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 3 of 12: a short explainer between the intro and the actual
// team-detail questions, so the League/Division/Season questions that
// follow don't feel arbitrary -- they're what drives accurate leaderboard
// grouping. No data collected here.
export default function DevRegisterBucketingScreen() {
  const router = useRouter();

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>
          In the next few screens, we'll get your team accurately placed alongside the other teams in your
          League, Division, and Age Group. This ensures your league's leaderboard stays fair and precise for
          everyone.
        </Text>
        <WizardNav onBack={() => router.back()} onNext={() => router.push("/dev-register-league")} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  body: {
    fontSize: 18,
    fontFamily: "Montserrat_400Regular",
    color: colors.textPrimary,
    lineHeight: 28,
    textAlign: "center",
    marginBottom: 32,
  },
});

import { Text, StyleSheet, ScrollView, Image, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 11 of 11, sub-page 4: multi-team Head Coach explainer.
export default function DevRegisterCompleteMultiTeamScreen() {
  const router = useRouter();

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>
          If you are the Head Coach of another team, click on "Head Coach? Start New Team!" in the @Batz
          Home screen menu on the top-right.
        </Text>

        <Image
          source={require("../assets/onboarding/head-coach-menu.jpg")}
          style={styles.screenshot}
          resizeMode="contain"
        />

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
  screenshot: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  spacer: { minHeight: 24 },
});

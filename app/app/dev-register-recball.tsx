import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const RECREATION_COMPETITIVE = [
  { key: "yes", label: "Recreation" },
  { key: "no", label: "Competitive" },
] as const;

// Page 5 of 11: "How would you classify your team from [League]?" --
// tapping a tile advances immediately. Internally still tracked as
// competesRecBall (Recreation = true, Competitive = false) since that's
// what page 6 branches on.
export default function DevRegisterRecBallScreen() {
  const router = useRouter();
  const { leagueName } = getDevWizardState();

  function choose(answer: "yes" | "no") {
    updateDevWizardState({ competesRecBall: answer === "yes" });
    router.push("/dev-register-division");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>How would you classify your team from {leagueName}?</Text>
        <TileSelect options={RECREATION_COMPETITIVE} selected={null} onSelect={choose} columns={2} />
        <WizardNav onBack={() => router.back()} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
});

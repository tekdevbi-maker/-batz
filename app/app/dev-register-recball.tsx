import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, updateDevWizardState, type TeamClassification } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const CLASSIFICATIONS: { key: TeamClassification; label: string }[] = [
  { key: "recreation", label: "Recreation" },
  { key: "competitive", label: "Competitive" },
  { key: "high_school", label: "High School" },
  { key: "college", label: "College" },
  { key: "adult_social", label: "Adult League" },
];

// Page 5 of 11: "How would you classify your team from [League]?" --
// tapping a tile advances immediately. Page 6 branches its division list
// on this classification (Rec Ball / age-division tiles, High School's
// Freshman-JV-Varsity, College's D1-D3, or Adult Social's free-text spot).
export default function DevRegisterRecBallScreen() {
  const router = useRouter();
  const { leagueName } = getDevWizardState();

  function choose(classification: TeamClassification) {
    updateDevWizardState({ classification });
    router.push("/dev-register-division");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>How would you classify your team from {leagueName}?</Text>
        <TileSelect options={CLASSIFICATIONS} selected={null} onSelect={choose} columns={2} />
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

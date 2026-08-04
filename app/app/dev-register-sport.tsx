import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const SPORTS = [
  { key: "Baseball", label: "Baseball" },
  { key: "Softball", label: "Softball" },
] as const;

// Page 4 of 11: "Is this for Baseball or Softball?" -- tapping a tile
// advances immediately, no separate Next tap needed.
export default function DevRegisterSportScreen() {
  const router = useRouter();

  function choose(sport: "Baseball" | "Softball") {
    updateDevWizardState({ sport });
    router.push("/dev-register-recball");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Is this for Baseball or Softball?</Text>
        <TileSelect options={SPORTS} selected={null} onSelect={choose} columns={2} />
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

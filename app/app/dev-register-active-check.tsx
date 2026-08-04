import { useState } from "react";
import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, resetDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

function currentYear(): number {
  return new Date().getFullYear();
}
function defaultSeason(): "Spring" | "Fall" {
  return new Date().getMonth() <= 4 ? "Spring" : "Fall";
}

// Page 8 of 11: only reached when a non-default season/year was picked on
// page 7. Reworded per review to avoid the original spec's contradiction
// (an option to "register historical stats" nested under a "No, not
// historical" answer) -- one question now cleanly branches into either
// outcome instead of two separately-worded questions.
export default function DevRegisterActiveCheckScreen() {
  const router = useRouter();
  const defSeason = defaultSeason();
  const defYear = currentYear();
  const [showFallback, setShowFallback] = useState(false);

  function chooseHistorical() {
    updateDevWizardState({ isHistorical: true });
    router.push("/dev-register-teamname");
  }

  function chooseActive() {
    setShowFallback(true);
  }

  function registerForDefault() {
    updateDevWizardState({ usingDefaultSeason: true, season: defSeason, year: defYear, isHistorical: false });
    router.push("/dev-register-teamname");
  }

  function cancelRegistration() {
    resetDevWizardState();
    router.replace("/");
  }

  if (showFallback) {
    const { season, year } = getDevWizardState();
    return (
      <>
        <SafeTopSpacer />
        <FadeIn>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>
            You may only register active teams during the {defSeason} {defYear} season.
          </Text>
          <Text style={styles.hint}>
            You picked {season} {year}, which isn't the current season.
          </Text>
          <TileSelect
            options={[
              { key: "default", label: `Register for the ${defSeason} ${defYear} season` },
              { key: "cancel", label: "Cancel Registration" },
            ]}
            selected={null}
            onSelect={(key) => (key === "default" ? registerForDefault() : cancelRegistration())}
            columns={1}
          />
          <WizardNav onBack={() => setShowFallback(false)} />
        </ScrollView>
        </FadeIn>
      </>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          Is this an active team for the current season, or are you recording stats from a season that
          already happened?
        </Text>
        <TileSelect
          options={[
            { key: "active", label: "Active team, current season" },
            { key: "historical", label: "Recording a completed season" },
          ]}
          selected={null}
          onSelect={(key) => (key === "active" ? chooseActive() : chooseHistorical())}
          columns={1}
        />
        <WizardNav onBack={() => router.back()} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 12, color: colors.textPrimary, textAlign: "center" },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 16, textAlign: "center" },
});

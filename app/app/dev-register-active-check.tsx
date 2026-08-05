import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

// Page 8 of 11: only reached when a non-default season/year was picked on
// page 7. Reworded per review to avoid the original spec's contradiction
// (an option to "register historical stats" nested under a "No, not
// historical" answer) -- one question now cleanly branches into either
// outcome instead of two separately-worded questions. Picking "Active
// team" just continues registration with whatever season/year was already
// chosen -- there's no restriction requiring an active team to use the
// current default season/year. "Recording a completed season" instead
// marks the team historical, which dev-register-confirm.tsx creates with
// season_status 'ended' so it lands directly under Home's "Previous
// Teams" rather than the in-season grid.
export default function DevRegisterActiveCheckScreen() {
  const router = useRouter();

  function chooseHistorical() {
    updateDevWizardState({ isHistorical: true });
    router.push("/dev-register-teamname");
  }

  function chooseActive() {
    updateDevWizardState({ isHistorical: false });
    router.push("/dev-register-teamname");
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
});

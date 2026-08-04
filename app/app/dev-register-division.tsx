import { useState } from "react";
import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const REC_BALL_DIVISIONS = ["Tee Ball", "Rookies", "Minors", "Majors", "Juniors", "Seniors"].map((d) => ({
  key: d,
  label: d,
}));

const AGE_DIVISIONS = ["7U", "8U", "9U", "10U", "11U", "12U", "13U", "14U", "15U", "16U", "17U", "18U"].map((d) => ({
  key: d,
  label: d,
}));

// Page 6 of 11: "Choose the division your team will be competing in." --
// which list shows depends on Page 5's Rec Ball answer. Unlike pages 4/5,
// this needs an explicit Next (division alone doesn't imply "done").
export default function DevRegisterDivisionScreen() {
  const router = useRouter();
  const { competesRecBall, division: saved } = getDevWizardState();
  const [division, setDivision] = useState<string | null>(saved);

  function handleNext() {
    updateDevWizardState({ division });
    router.push("/dev-register-season");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Choose the division your team will be competing in.</Text>
        {competesRecBall ? (
          <TileSelect options={REC_BALL_DIVISIONS} selected={division} onSelect={setDivision} columns={3} />
        ) : (
          <TileSelect options={AGE_DIVISIONS} selected={division} onSelect={setDivision} columns={3} />
        )}
        <WizardNav onBack={() => router.back()} onNext={handleNext} nextDisabled={!division} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
});

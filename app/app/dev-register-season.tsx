import { useState } from "react";
import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";
import Dropdown from "../components/Dropdown";

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

function currentYear(): number {
  return new Date().getFullYear();
}
function defaultSeason(): (typeof SEASONS)[number] {
  const month = new Date().getMonth(); // 0-indexed: 0=Jan .. 11=Dec
  return month <= 4 ? "Spring" : "Fall"; // Jan-May -> Spring, else Fall
}
const YEAR_OPTIONS = Array.from({ length: 9 }, (_, i) => currentYear() - 2 + i);

// Page 7 of 11: "Will this be for [DefaultSeason] [DefaultYear]?" -- either
// answer just labels the team (for League/Division/Season grouping and
// leaderboards) and advances straight to Team Name. There's no path here
// to register a team as an already-completed/historical season -- every
// team starts active, in_season (see dev-register-confirm.tsx).
export default function DevRegisterSeasonScreen() {
  const router = useRouter();
  const defSeason = defaultSeason();
  const defYear = currentYear();

  const [pickingCustom, setPickingCustom] = useState(getDevWizardState().usingDefaultSeason === false);
  const [season, setSeason] = useState<(typeof SEASONS)[number]>(getDevWizardState().season ?? defSeason);
  const [year, setYear] = useState<number>(getDevWizardState().year ?? defYear);

  function chooseDefault() {
    updateDevWizardState({ usingDefaultSeason: true, season: defSeason, year: defYear });
    router.push("/dev-register-teamname");
  }

  function handleNext() {
    updateDevWizardState({ usingDefaultSeason: false, season, year });
    router.push("/dev-register-teamname");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          Will this be for {defSeason} {defYear}?
        </Text>

        <TileSelect
          options={[
            { key: "yes", label: `Yes, ${defSeason} ${defYear}` },
            { key: "custom", label: "Pick Season/Year" },
          ]}
          selected={pickingCustom ? "custom" : null}
          onSelect={(key) => {
            if (key === "yes") {
              chooseDefault();
            } else {
              setPickingCustom(true);
            }
          }}
          columns={2}
        />

        {pickingCustom && (
          <>
            <Dropdown label="Season" options={SEASONS} selected={season} onSelect={setSeason} />
            <Dropdown label="Year" options={YEAR_OPTIONS} selected={year} onSelect={setYear} />
          </>
        )}

        <WizardNav onBack={() => router.back()} onNext={pickingCustom ? handleNext : undefined} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
});

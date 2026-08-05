import { useState } from "react";
import { Text, TextInput, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const OTHER_KEY = "Other";

const REC_BALL_DIVISIONS = ["Tee Ball", "Rookies", "Minors", "Majors", "Juniors", "Seniors", OTHER_KEY].map((d) => ({
  key: d,
  label: d,
}));

const AGE_DIVISIONS = ["7U", "8U", "9U", "10U", "11U", "12U", "13U", "14U", "15U", "16U", "17U", "18U", OTHER_KEY].map(
  (d) => ({ key: d, label: d })
);

const HIGH_SCHOOL_DIVISIONS = ["Freshman", "JV", "Varsity", OTHER_KEY].map((d) => ({ key: d, label: d }));

const COLLEGE_DIVISIONS = ["D1", "D2", "D3", OTHER_KEY].map((d) => ({ key: d, label: d }));

// Page 6 of 11: "Choose the division your team will be competing in." --
// which list shows depends on Page 5's classification answer. Recreation,
// Competitive, High School, and College all get their own preset tiles
// plus an "Other" free-text fallback; Adult League skips tiles entirely
// and is just a free-text field, since there's no standard division
// naming there. `division` is saved as whatever's actually typed for
// "Other"/Adult League, not a placeholder word. Unlike pages 4/5, this
// needs an explicit Next (division alone doesn't imply "done").
export default function DevRegisterDivisionScreen() {
  const router = useRouter();
  const { classification, division: saved } = getDevWizardState();
  const isFreeTextOnly = classification === "adult_social";

  const presetOptions =
    classification === "recreation"
      ? REC_BALL_DIVISIONS
      : classification === "high_school"
      ? HIGH_SCHOOL_DIVISIONS
      : classification === "college"
      ? COLLEGE_DIVISIONS
      : AGE_DIVISIONS;
  const presetKeys = presetOptions.map((d) => d.key);
  const savedIsPreset = !!saved && presetKeys.includes(saved);

  const [selectedTile, setSelectedTile] = useState<string | null>(
    isFreeTextOnly ? null : saved ? (savedIsPreset ? saved : OTHER_KEY) : null
  );
  const [otherText, setOtherText] = useState(isFreeTextOnly ? saved ?? "" : saved && !savedIsPreset ? saved : "");

  const division = isFreeTextOnly ? otherText.trim() : selectedTile === OTHER_KEY ? otherText.trim() : selectedTile;

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

        {isFreeTextOnly ? (
          <View style={styles.otherBlock}>
            <Text style={styles.label}>Enter your division</Text>
            <TextInput
              style={styles.input}
              value={otherText}
              onChangeText={setOtherText}
              placeholder="Division name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        ) : (
          <>
            <TileSelect options={presetOptions} selected={selectedTile} onSelect={setSelectedTile} columns={3} />
            {selectedTile === OTHER_KEY && (
              <View style={styles.otherBlock}>
                <Text style={styles.label}>Enter your division</Text>
                <TextInput
                  style={styles.input}
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder="Division name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}
          </>
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
  otherBlock: { marginTop: 16 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
});

import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { listLeagues, type League } from "../lib/leaguesRepository";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 3 of 11: "Which league are you affiliated with?" -- an autosuggest
// text field doubles as the free-entry box (formerly the separate "I don't
// see it listed..." dropdown option): typing a name that matches an
// existing League selects it, and typing anything else is treated as a
// brand-new League once the user pauses (the "new league" hint is delayed
// so it doesn't flash on every keystroke while still-matching text is
// typed).
const NEW_LEAGUE_HINT_DELAY_MS = 600;

export default function DevRegisterLeagueScreen() {
  const router = useRouter();
  const saved = getDevWizardState();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [query, setQuery] = useState(saved.leagueName ?? "");
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewLeagueHint, setShowNewLeagueHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listLeagues(supabase).then((all) => {
      setLeagues(all);
      if (!saved.isNewLeague && saved.leagueId) {
        setSelectedLeague(all.find((l) => l.id === saved.leagueId) ?? null);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exactMatch = leagues.find((l) => l.name.toLowerCase() === query.trim().toLowerCase()) ?? null;
  const isNewLeague = query.trim().length > 0 && !exactMatch;
  const canProceed = query.trim().length > 0;

  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return leagues.filter((l) => l.name.toLowerCase().includes(q) && l.name.toLowerCase() !== q).slice(0, 8);
  })();

  function handleChangeText(text: string) {
    setQuery(text);
    setShowSuggestions(true);
    setShowNewLeagueHint(false);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowNewLeagueHint(true), NEW_LEAGUE_HINT_DELAY_MS);
  }

  function selectSuggestion(league: League) {
    setQuery(league.name);
    setSelectedLeague(league);
    setShowSuggestions(false);
    setShowNewLeagueHint(false);
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  function handleNext() {
    const trimmed = query.trim();
    if (exactMatch) {
      updateDevWizardState({ isNewLeague: false, leagueId: exactMatch.id, leagueName: exactMatch.name });
    } else {
      updateDevWizardState({ isNewLeague: true, leagueId: null, leagueName: trimmed });
    }
    router.push("/dev-register-sport");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.intro}>Now, let's get your team set up!</Text>
        <Text style={styles.title}>What league do you represent?</Text>

        <Text style={styles.label}>League Name</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Start typing your league's name"
          placeholderTextColor={colors.textSecondary}
        />

        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionList}>
            {suggestions.map((l) => (
              <Pressable key={l.id} style={styles.suggestionRow} onPress={() => selectSuggestion(l)}>
                <Text style={styles.suggestionText}>
                  {l.name}
                  {l.verificationStatus === "pending" ? " (pending)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {isNewLeague && showNewLeagueHint && (
          <Text style={styles.hint}>New leagues are held for admin verification before they're public.</Text>
        )}

        <WizardNav onBack={() => router.back()} onNext={handleNext} nextDisabled={!canProceed} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  intro: { fontSize: 18, fontFamily: "Montserrat_600SemiBold", marginBottom: 4, color: colors.textSecondary, textAlign: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginBottom: 4 },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  suggestionList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginTop: 4,
  },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular" },
});

import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { listLeagues, type League } from "../lib/leaguesRepository";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 3 of 11: "Which league are you affiliated with?" -- two separate
// fields now: an autosuggest search restricted to existing (already
// verified) leagues, and a distinct "Or...Make Your Own League" field for
// starting a brand-new one. The two are mutually exclusive -- picking a
// suggestion clears the new-league text and vice versa. New leagues no
// longer sit in an admin-verification queue (see
// 20260805270000_self_serve_leagues_no_longer_need_approval.sql), so
// picking "Make Your Own" instead just warns the coach, via a one-time
// popup, that League/Division selection is what buckets every team
// together correctly.
export default function DevRegisterLeagueScreen() {
  const router = useRouter();
  const saved = getDevWizardState();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [query, setQuery] = useState(saved.isNewLeague ? "" : saved.leagueName ?? "");
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState(saved.isNewLeague ? saved.leagueName ?? "" : "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNewLeaguePopup, setShowNewLeaguePopup] = useState(false);

  useEffect(() => {
    listLeagues(supabase).then((all) => {
      setLeagues(all);
      setLoadError(null);
      if (!saved.isNewLeague && saved.leagueId) {
        setSelectedLeague(all.find((l) => l.id === saved.leagueId) ?? null);
      }
    }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : "Failed to load leagues.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceed = !!selectedLeague || newLeagueName.trim().length > 0;

  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return leagues.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 8);
  })();

  function handleChangeQuery(text: string) {
    setQuery(text);
    setSelectedLeague(null);
    setShowSuggestions(true);
    if (text.trim().length > 0) setNewLeagueName("");
  }

  function selectSuggestion(league: League) {
    setQuery(league.name);
    setSelectedLeague(league);
    setShowSuggestions(false);
    setNewLeagueName("");
  }

  function handleChangeNewLeagueName(text: string) {
    setNewLeagueName(text);
    if (text.trim().length > 0) {
      setQuery("");
      setSelectedLeague(null);
      setShowSuggestions(false);
    }
  }

  function proceed() {
    if (selectedLeague) {
      updateDevWizardState({ isNewLeague: false, leagueId: selectedLeague.id, leagueName: selectedLeague.name });
    } else {
      updateDevWizardState({ isNewLeague: true, leagueId: null, leagueName: newLeagueName.trim() });
    }
    router.push("/dev-register-sport");
  }

  function handleNext() {
    if (!selectedLeague && newLeagueName.trim().length > 0) {
      setShowNewLeaguePopup(true);
      return;
    }
    proceed();
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.intro}>Now, let's get your team set up!</Text>
        <Text style={styles.title}>What league do you represent?</Text>

        <Text style={styles.label}>Choose a Verified League Name</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChangeQuery}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Start typing your league's name"
          placeholderTextColor={colors.textSecondary}
        />

        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionList}>
            {suggestions.map((l) => (
              <Pressable key={l.id} style={styles.suggestionRow} onPress={() => selectSuggestion(l)}>
                <Text style={styles.suggestionText}>{l.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {loadError && (
          <Text style={styles.hint}>Couldn't load leagues: {loadError}. Pull down to retry or check your connection.</Text>
        )}

        <Text style={styles.label}>Or...Make Your Own League</Text>
        <TextInput
          style={styles.input}
          value={newLeagueName}
          onChangeText={handleChangeNewLeagueName}
          placeholder="Enter a new league name"
          placeholderTextColor={colors.textSecondary}
        />

        <WizardNav onBack={() => router.back()} onNext={handleNext} nextDisabled={!canProceed} />
      </ScrollView>

      <Modal visible={showNewLeaguePopup} transparent animationType="fade" onRequestClose={() => setShowNewLeaguePopup(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              League selection is so ALL the teams in your League/Division are bucketed appropriately. If you want to
              start your own league, make sure other teams in your League/Division know about it too!
            </Text>
            <Pressable
              style={styles.modalButton}
              onPress={() => {
                setShowNewLeaguePopup(false);
                proceed();
              }}
            >
              <Text style={styles.modalButtonText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 48 },
  intro: { fontSize: 18, fontFamily: "Montserrat_600SemiBold", marginBottom: 4, color: colors.textSecondary, textAlign: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginBottom: 4, marginTop: 16 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 16, width: "100%", maxWidth: 400 },
  modalText: { color: colors.textPrimary, fontSize: 16, fontFamily: "Montserrat_400Regular", lineHeight: 22 },
  modalButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  modalButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
});

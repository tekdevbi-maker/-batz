import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import {
  createDivision,
  createVerifiedLeague,
  deleteDivision,
  deleteLeague,
  listAllUserEmails,
  listDivisions,
  listLeagues,
  verifyLeague,
  type Division,
  type League,
} from "../lib/leaguesRepository";
import {
  CUSTOMER_CARE_CATEGORIES,
  listAllCustomerCareRequests,
  markCustomerCareRequestResolved,
  type CustomerCareRequest,
} from "../lib/customerCareRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function LeagueRow({ league, onChanged }: { league: League; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [newDivisionName, setNewDivisionName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadDivisions() {
    listDivisions(supabase, league.id).then(setDivisions).catch((err) => setError(errorMessage(err)));
  }

  useEffect(() => {
    if (expanded) loadDivisions();
  }, [expanded]);

  async function handleVerify() {
    try {
      await verifyLeague(supabase, league.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function handleDelete() {
    Alert.alert("Delete this league?", `"${league.name}" and its divisions/teams will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteLeague(supabase, league.id);
            onChanged();
          } catch (err) {
            setError(errorMessage(err));
          }
        },
      },
    ]);
  }

  async function handleAddDivision() {
    if (!newDivisionName.trim()) return;
    try {
      await createDivision(supabase, { leagueId: league.id, name: newDivisionName.trim() });
      setNewDivisionName("");
      loadDivisions();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteDivision(divisionId: string) {
    try {
      await deleteDivision(supabase, divisionId);
      loadDivisions();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <View style={styles.leagueRow}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.leagueHeader}>
        <Text style={styles.leagueName}>
          {league.name} ({league.initials})
        </Text>
        <Text style={league.verificationStatus === "pending" ? styles.pendingBadge : styles.verifiedBadge}>
          {league.verificationStatus}
        </Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actionRow}>
        {league.verificationStatus === "pending" && (
          <Pressable style={styles.secondaryButton} onPress={handleVerify}>
            <Text style={styles.secondaryButtonText}>Verify</Text>
          </Pressable>
        )}
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.divisionsBlock}>
          {divisions.map((d) => (
            <View key={d.id} style={styles.divisionRow}>
              <Text style={styles.plainText}>{d.name}</Text>
              <Pressable onPress={() => handleDeleteDivision(d.id)}>
                <Text style={styles.deleteButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.divisionAddRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newDivisionName}
              onChangeText={setNewDivisionName}
              placeholder="New division (e.g. 12U)"
            />
            <Pressable style={styles.secondaryButton} onPress={handleAddDivision}>
              <Text style={styles.secondaryButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function AdminScreen() {
  const { isAdmin, loading, impersonate } = useRequireAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [careRequests, setCareRequests] = useState<CustomerCareRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newLeagueName, setNewLeagueName] = useState("");

  const [impersonateEmail, setImpersonateEmail] = useState("");
  const [impersonateBusy, setImpersonateBusy] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [allEmails, setAllEmails] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (isAdmin) listAllUserEmails(supabase).then(setAllEmails).catch(() => {});
  }, [isAdmin]);

  const emailSuggestions =
    showSuggestions && impersonateEmail.trim().length > 0
      ? allEmails.filter((e) => e.toLowerCase().includes(impersonateEmail.trim().toLowerCase())).slice(0, 8)
      : [];

  function selectSuggestion(email: string) {
    setImpersonateEmail(email);
    setShowSuggestions(false);
  }

  async function handleImpersonate() {
    if (!impersonateEmail.trim()) return;
    setImpersonateBusy(true);
    setImpersonateError(null);
    try {
      await impersonate(impersonateEmail.trim());
      setImpersonateEmail("");
      router.replace("/");
    } catch (err) {
      setImpersonateError(errorMessage(err));
    } finally {
      setImpersonateBusy(false);
    }
  }

  function refresh() {
    listLeagues(supabase).then(setLeagues).catch((err) => setError(errorMessage(err)));
    listAllCustomerCareRequests(supabase).then(setCareRequests).catch((err) => setError(errorMessage(err)));
  }

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  async function handleResolve(id: string) {
    try {
      await markCustomerCareRequestResolved(supabase, id);
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleAddLeague() {
    if (!newLeagueName.trim()) return;
    try {
      await createVerifiedLeague(supabase, { name: newLeagueName.trim() });
      setNewLeagueName("");
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return null;
  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.plainText}>You're not an admin.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Impersonate a User</Text>
      <Text style={styles.hint}>
        Sign in as this user to see exactly what they see while debugging a report. You'll get a "Return
        to Admin" banner to switch back at any time.
      </Text>
      <TextInput
        style={styles.input}
        value={impersonateEmail}
        onChangeText={(t) => {
          setImpersonateEmail(t);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="user@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      {emailSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {emailSuggestions.map((email) => (
            <Pressable key={email} style={styles.suggestionRow} onPress={() => selectSuggestion(email)}>
              <Text style={styles.suggestionText}>{email}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {impersonateError && <Text style={styles.error}>{impersonateError}</Text>}
      <Pressable
        style={[styles.button, (!impersonateEmail.trim() || impersonateBusy) && styles.buttonDisabled]}
        disabled={!impersonateEmail.trim() || impersonateBusy}
        onPress={handleImpersonate}
      >
        {impersonateBusy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Impersonate</Text>}
      </Pressable>

      <Text style={styles.title}>Leagues</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {leagues.map((league) => (
        <LeagueRow key={league.id} league={league} onChanged={refresh} />
      ))}

      <Text style={styles.label}>Add a League (verified immediately)</Text>
      <TextInput
        style={styles.input}
        value={newLeagueName}
        onChangeText={setNewLeagueName}
        placeholder="League name"
      />
      <Pressable style={styles.button} onPress={handleAddLeague}>
        <Text style={styles.buttonText}>Add League</Text>
      </Pressable>

      <Text style={styles.title}>Customer Care Requests</Text>
      {careRequests.length === 0 && <Text style={styles.hint}>No requests.</Text>}
      {careRequests.map((r) => (
        <View key={r.id} style={styles.leagueRow}>
          <View style={styles.leagueHeader}>
            <Text style={styles.leagueName}>{CUSTOMER_CARE_CATEGORIES.find((c) => c.value === r.category)?.label}</Text>
            <Text style={r.status === "open" ? styles.pendingBadge : styles.verifiedBadge}>{r.status}</Text>
          </View>
          <Text style={styles.plainText}>{r.description}</Text>
          <Text style={styles.hint}>{new Date(r.createdAt).toLocaleString()}</Text>
          {r.status === "open" && (
            <Pressable style={styles.secondaryButton} onPress={() => handleResolve(r.id)}>
              <Text style={styles.secondaryButtonText}>Mark Resolved</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 8, color: colors.textPrimary },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 16, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  suggestionBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginTop: -4,
    overflow: "hidden",
  },
  suggestionRow: { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border },
  suggestionText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  deleteButtonText: { color: colors.danger, fontFamily: "Montserrat_600SemiBold" },
  leagueRow: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 8 },
  leagueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  leagueName: { fontSize: 17, fontFamily: "Montserrat_600SemiBold", flexShrink: 1, color: colors.textPrimary },
  pendingBadge: { color: colors.warningText, fontFamily: "Montserrat_400Regular", backgroundColor: colors.warningBg, paddingHorizontal: 8, borderRadius: 4 },
  verifiedBadge: { color: colors.success, fontFamily: "Montserrat_400Regular", backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, borderRadius: 4 },
  actionRow: { flexDirection: "row", gap: 8 },
  divisionsBlock: { gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  divisionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  divisionAddRow: { flexDirection: "row", gap: 8, alignItems: "center" },
});

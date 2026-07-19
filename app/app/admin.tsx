import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import {
  SANCTIONING_BODIES,
  createDivision,
  createVerifiedLeague,
  deleteDivision,
  deleteLeague,
  listDivisions,
  listLeagues,
  verifyLeague,
  type Division,
  type League,
  type SanctioningBody,
} from "../lib/leaguesRepository";

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
          {league.name} ({league.initials}) -- {league.sanctioningBody}
        </Text>
        <Text style={league.verificationStatus === "pending" ? styles.pendingBadge : styles.verifiedBadge}>
          {league.verificationStatus}
        </Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actionRow}>
        {league.verificationStatus === "pending" && (
          <Pressable style={styles.secondaryButton} onPress={handleVerify}>
            <Text>Verify</Text>
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
              <Text>{d.name}</Text>
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
              <Text>Add</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function AdminScreen() {
  const { isAdmin, loading } = useRequireAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueBody, setNewLeagueBody] = useState<SanctioningBody>(SANCTIONING_BODIES[0]);

  function refresh() {
    listLeagues(supabase).then(setLeagues).catch((err) => setError(errorMessage(err)));
  }

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  async function handleAddLeague() {
    if (!newLeagueName.trim()) return;
    try {
      await createVerifiedLeague(supabase, { name: newLeagueName.trim(), sanctioningBody: newLeagueBody });
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
        <Text>You're not an admin.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Leagues</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {leagues.map((league) => (
        <LeagueRow key={league.id} league={league} onChanged={refresh} />
      ))}

      <Text style={styles.label}>Add a League (verified immediately)</Text>
      <View style={styles.chipRow}>
        {SANCTIONING_BODIES.map((body) => (
          <Pressable
            key={body}
            style={[styles.chip, newLeagueBody === body && styles.chipSelected]}
            onPress={() => setNewLeagueBody(body)}
          >
            <Text>{body}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={newLeagueName}
        onChangeText={setNewLeagueName}
        placeholder="League name"
      />
      <Pressable style={styles.button} onPress={handleAddLeague}>
        <Text style={styles.buttonText}>Add League</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 16 },
  error: { color: "#b91c1c", fontSize: 13 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#dbeafe", borderColor: "#1d4ed8" },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#b91c1c",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  deleteButtonText: { color: "#b91c1c", fontWeight: "600" },
  leagueRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 12, gap: 8 },
  leagueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  leagueName: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  pendingBadge: { color: "#92400e", backgroundColor: "#fef3c7", paddingHorizontal: 8, borderRadius: 4 },
  verifiedBadge: { color: "#15803d", backgroundColor: "#dcfce7", paddingHorizontal: 8, borderRadius: 4 },
  actionRow: { flexDirection: "row", gap: 8 },
  divisionsBlock: { gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#eee" },
  divisionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  divisionAddRow: { flexDirection: "row", gap: 8, alignItems: "center" },
});

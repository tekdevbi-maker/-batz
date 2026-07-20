import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  CUSTOMER_CARE_CATEGORIES,
  submitCustomerCareRequest,
  type CustomerCareCategory,
} from "../../../lib/customerCareRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function CustomerCareScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [category, setCategory] = useState<CustomerCareCategory>("coach_unreachable");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCustomerCareRequest(supabase, {
        requesterUserId: session.user.id,
        teamId: teamId ?? null,
        category,
        description,
      });
      setSubmitted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) return null;

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Request submitted</Text>
        <Text style={styles.hint}>We've logged your request and someone will follow up.</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reach Out to Customer Care</Text>
      <Text style={styles.hint}>Can't reach your team's coaches? Let us know what's going on.</Text>

      <Text style={styles.label}>What's this about?</Text>
      <View style={styles.chipRow}>
        {CUSTOMER_CARE_CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.chip, category === c.value && styles.chipSelected]}
            onPress={() => setCategory(c.value)}
          >
            <Text>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Tell us more</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        placeholder="What's happening?"
      />

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (!description.trim() || submitting) && styles.buttonDisabled]}
        disabled={!description.trim() || submitting}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Submit Request</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700" },
  hint: { color: "#555", fontSize: 13, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  error: { color: "#b91c1c", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#dbeafe", borderColor: "#1d4ed8" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
});

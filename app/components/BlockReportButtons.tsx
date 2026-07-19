import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { submitBlockOrReport } from "../lib/socialRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// spec Section 10: block/report is a record-keeping safety valve on the
// social layer (follow, achievement posts) -- this is the one shared UI
// for both, reused on player profiles and activity feed posts.
export default function BlockReportButtons({
  myUserId,
  targetUserId,
  activityFeedItemId,
}: {
  myUserId: string;
  targetUserId: string;
  activityFeedItemId?: string;
}) {
  const [mode, setMode] = useState<"block" | "report" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"block" | "report" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (myUserId === targetUserId) return null;

  async function handleSubmit(actionType: "block" | "report") {
    setSubmitting(true);
    setError(null);
    try {
      await submitBlockOrReport(supabase, {
        reporterUserId: myUserId,
        targetUserId,
        actionType,
        reason: reason.trim() || undefined,
      });
      setDone(actionType);
      setMode(null);
      setReason("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <Text style={styles.hint}>{done === "block" ? "Blocked." : "Reported. Thanks for letting us know."}</Text>;
  }

  return (
    <View style={styles.container}>
      {!mode && (
        <View style={styles.row}>
          <Pressable onPress={() => setMode("report")}>
            <Text style={styles.link}>{activityFeedItemId ? "Report post" : "Report"}</Text>
          </Pressable>
          <Pressable onPress={() => setMode("block")}>
            <Text style={styles.link}>Block</Text>
          </Pressable>
        </View>
      )}
      {mode && (
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder={mode === "report" ? "Reason (optional)" : "Why are you blocking? (optional)"}
            value={reason}
            onChangeText={setReason}
          />
          <Pressable disabled={submitting} onPress={() => handleSubmit(mode)}>
            <Text style={styles.link}>{mode === "block" ? "Confirm block" : "Submit report"}</Text>
          </Pressable>
          <Pressable onPress={() => setMode(null)}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  link: { color: "#b91c1c", fontSize: 12 },
  hint: { color: "#555", fontSize: 12 },
  error: { color: "#b91c1c", fontSize: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6, fontSize: 12, minWidth: 160 },
});

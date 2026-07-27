import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import { getTeamJoinContext, joinTeamAsFollower, TeamAtCapacityError, type TeamJoinContext } from "../lib/claimRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// A team join link always embeds the team's uuid (e.g.
// batz:///join/2a394d71-16dc-4342-b902-52f199a0c07e, or an exp:// dev
// link with the same path) -- pulling the uuid out with a regex works
// regardless of which scheme/host wrapped it, so this doesn't need to
// know the difference between a dev-client link and a real one.
const TEAM_ID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// Any signed-in user pastes in a coach's team join link to start
// following that team, without needing to open the link itself (which
// only works if it's tapped from another app, not typed/pasted).
export default function JoinTeamByLinkScreen() {
  const router = useRouter();
  const { session } = useRequireAuth();
  const firstName = (session?.user.user_metadata?.first_name as string | undefined) ?? "";
  const lastName = (session?.user.user_metadata?.last_name as string | undefined) ?? "";

  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [context, setContext] = useState<TeamJoinContext | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function handleCheckLink() {
    const match = link.match(TEAM_ID_PATTERN);
    if (!match) {
      setCheckError("That doesn't look like a Team Join Link. Ask your coach for the correct link.");
      setContext(null);
      return;
    }
    setChecking(true);
    setCheckError(null);
    setContext(null);
    try {
      const ctx = await getTeamJoinContext(supabase, match[0]);
      setContext(ctx);
    } catch {
      setCheckError("That link doesn't match a real team. Ask your coach for the correct link.");
    } finally {
      setChecking(false);
    }
  }

  async function handleJoin() {
    if (!context) return;
    setJoining(true);
    setJoinError(null);
    try {
      await joinTeamAsFollower(supabase, context.teamId, firstName, lastName);
      setJoined(true);
    } catch (err) {
      setJoinError(err instanceof TeamAtCapacityError ? err.message : errorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  if (!session) return null;

  if (joined) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.hint}>
          You're now following {context?.teamName} -- it'll show up on your Home screen.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Go to @Batz</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Join a Team</Text>
      <Text style={styles.hint}>
        Paste the Team Join Link your coach shared with you to start following that team.
      </Text>

      <Text style={styles.label}>Team Join Link</Text>
      <TextInput
        style={styles.input}
        value={link}
        onChangeText={(t) => {
          setLink(t);
          setContext(null);
          setCheckError(null);
        }}
        placeholder="Paste the link here"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {checkError && <Text style={styles.error}>{checkError}</Text>}

      {!context ? (
        <Pressable
          style={[styles.button, (!link.trim() || checking) && styles.buttonDisabled]}
          disabled={!link.trim() || checking}
          onPress={handleCheckLink}
        >
          {checking ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Check Link</Text>}
        </Pressable>
      ) : (
        <>
          <Text style={styles.confirm}>
            Invited by {context.coachFirstName || context.coachLastName
              ? `Coach ${`${context.coachFirstName ?? ""} ${context.coachLastName ?? ""}`.trim()}`
              : "your coach"}{" "}
            -- {context.teamName}, {context.leagueName}, {context.divisionName}, {context.season}{" "}
            {context.year}
          </Text>
          {joinError && <Text style={styles.error}>{joinError}</Text>}
          <Pressable style={[styles.button, joining && styles.buttonDisabled]} disabled={joining} onPress={handleJoin}>
            {joining ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Follow This Team</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
  error: { color: colors.error, fontSize: 14 },
  confirm: { color: colors.textPrimary, fontSize: 15, marginTop: 8, lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
});
